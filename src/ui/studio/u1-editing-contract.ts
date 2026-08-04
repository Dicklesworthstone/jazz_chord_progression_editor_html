/**
 * U1 quick-entry and stable-ID lead-sheet chart-editing contract.
 *
 * This module is the code-facing U1 authority. It declares the editing
 * surface, its bounded public values, the closed operation inventory, and the
 * exact application channel each operation is allowed to use. It contains no
 * DOM access, no Preact import, and no application import: U1 adds no mutation
 * channel of its own, so the binding to A0 is declared as reviewed literal
 * strings and proved against the live tuples by the static contract test.
 *
 * The independent expectations live under `tests/fixtures/editing/`.
 * Production components may be compared with those fixtures; they may never
 * generate, rewrite, or bless their expectations.
 */
import type {
  UiDensity,
  UiDiagnostic,
  UiInteractionSource,
} from "../ui-contract";

export const U1_EDITING_CONTRACT_SCHEMA = "changes.ui.u1-editing-contract.v1";
export const U1_EDITING_CONTRACT_PACKAGE = "U1";
export const U1_EDITING_POLICY_ID = "changes.ui.chart-editing";
export const U1_EDITING_POLICY_VERSION = 1;
export const U1_EDITING_CONTRACT_BEAD_ID =
  "jcpe-milestone-reliable-studio-l3a.10.1";

/**
 * The code-facing status of the U1 surface.
 *
 * The production package is live in the generated artifact: all 25 components,
 * all 33 operations with their measured application channels, all 38 key
 * bindings, both view modes, and the five reviewed viewports. Its independent
 * proof lives in `tests/conformance/u1-*`, `tests/integration/u1-*`, and
 * `tests/e2e/u1-*`, and every declared law now carries executed evidence on
 * both polarities.
 *
 * The fixture packet under `tests/fixtures/editing/` deliberately still reads
 * `specified-not-implemented` with all four claim flags false, and
 * `scripts/validate-u1-contract.ts` pins them that way. That is not drift: it
 * is the *specification* leaf's statement about itself, so the packet can never
 * be read as evidence for the code it exists to judge. Moving those flags is a
 * change to the reviewed packet and needs a recorded human acceptance, exactly
 * as the sibling A0/U1 packet has.
 */
export const U1_EDITING_IMPLEMENTATION_STATUS = "implemented-live";

/* -------------------------------------------------------------------------- */
/* Surfaces and components                                                     */
/* -------------------------------------------------------------------------- */

export const U1_EDITING_SURFACES = /* @__PURE__ */ Object.freeze([
  "quick-entry",
  "chart",
  "range",
  "view",
] as const);

export type U1EditingSurface = (typeof U1_EDITING_SURFACES)[number];

export const U1_COMPONENT_INVENTORY = /* @__PURE__ */ Object.freeze([
  { id: "U1-CMP-001", name: "QuickEntryPanel", surface: "quick-entry" },
  { id: "U1-CMP-002", name: "QuickEntryDraftField", surface: "quick-entry" },
  { id: "U1-CMP-003", name: "QuickEntryPreview", surface: "quick-entry" },
  { id: "U1-CMP-004", name: "QuickEntryTokenList", surface: "quick-entry" },
  { id: "U1-CMP-005", name: "QuickEntryToken", surface: "quick-entry" },
  { id: "U1-CMP-006", name: "QuickEntryTargetPicker", surface: "quick-entry" },
  { id: "U1-CMP-007", name: "InsertionPlanNotice", surface: "quick-entry" },
  { id: "U1-CMP-008", name: "ChartRegion", surface: "chart" },
  { id: "U1-CMP-009", name: "ChartSectionView", surface: "chart" },
  { id: "U1-CMP-010", name: "ChartSectionHeader", surface: "chart" },
  { id: "U1-CMP-011", name: "ChartMeasureView", surface: "chart" },
  { id: "U1-CMP-012", name: "ChordCard", surface: "chart" },
  { id: "U1-CMP-013", name: "ChordCardMenu", surface: "chart" },
  { id: "U1-CMP-014", name: "ChordCardDragHandle", surface: "chart" },
  { id: "U1-CMP-015", name: "InsertionTarget", surface: "chart" },
  { id: "U1-CMP-016", name: "InlineSymbolEditor", surface: "chart" },
  { id: "U1-CMP-017", name: "DurationEditor", surface: "chart" },
  { id: "U1-CMP-018", name: "MeasureFillNotice", surface: "chart" },
  { id: "U1-CMP-019", name: "MeasureCompletionDialog", surface: "chart" },
  { id: "U1-CMP-020", name: "SectionBoundaryMenu", surface: "chart" },
  { id: "U1-CMP-021", name: "EditRefusalNotice", surface: "chart" },
  { id: "U1-CMP-022", name: "RangeSelectionBar", surface: "range" },
  { id: "U1-CMP-023", name: "RangeBoundaryHandle", surface: "range" },
  { id: "U1-CMP-024", name: "RangeBeatField", surface: "range" },
  { id: "U1-CMP-025", name: "ChartViewModeToggle", surface: "view" },
] as const);

export type U1ComponentContract = (typeof U1_COMPONENT_INVENTORY)[number];
export type U1ComponentId = U1ComponentContract["id"];
export type U1ComponentName = U1ComponentContract["name"];

export const U1_COMPONENT_COUNT = 25;

/* -------------------------------------------------------------------------- */
/* Bounds                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Every bound is either an inherited upstream domain/T0/A0 limit or a value
 * mechanically derived from one. `maxPreviewTokens` and `maxPreviewMeasures`
 * follow from the 4,096 code-point draft cap: the shortest token and the
 * shortest shared-barline measure each occupy at least two code points.
 */
export const U1_EDITING_LIMITS = /* @__PURE__ */ Object.freeze({
  maxDraftCodePoints: 4_096,
  maxDraftUtf8Bytes: 16_384,
  maxPreviewTokens: 2_048,
  maxPreviewMeasures: 2_048,
  maxPreviewSections: 64,
  maxPreviewDiagnostics: 64,
  maxQuickEntryIssueCodes: 64,
  maxIssueCodeCodePoints: 128,
  maxRenderedSections: 64,
  maxRenderedMeasures: 65_536,
  maxRenderedEvents: 8_192,
  maxSelectedEventIds: 8_192,
  maxSymbolDraftCodePoints: 256,
  maxSectionNameCodePoints: 256,
  maxSectionAnnotationCodePoints: 2_000,
  maxCompletionReasonCodePoints: 2_000,
  maxExactBeatCodePoints: 128,
  maxCardMenuItems: 200,
  maxCardMenuDepth: 2,
  maxUndoLabelCodePoints: 160,
  maxRefusalMessageCodePoints: 512,
  maxCommandsPerUserAction: 1,
  maxConcurrentDragSessions: 1,
  maxPointerCapturesPerCard: 1,
  staticListenersPerChordCard: 3,
  staticListenersPerInsertionTarget: 1,
  staticListenersPerChartRegion: 3,
  transientDragListenersPerSession: 3,
  pointerDragThresholdCssPx: 8,
  touchTargetCssPx: 44,
  typeaheadResetMs: 700,
  textCommandCoalesceWindowMs: 1_000,
} as const);

export type U1EditingLimitKey = keyof typeof U1_EDITING_LIMITS;

/** Maps each bounded public field to the limit key that bounds it. */
export const U1_PUBLIC_BOUND_ASSIGNMENTS = /* @__PURE__ */ Object.freeze({
  quickEntryDraftText: "maxDraftCodePoints",
  quickEntryDraftBytes: "maxDraftUtf8Bytes",
  quickEntryPreviewTokens: "maxPreviewTokens",
  quickEntryPreviewMeasures: "maxPreviewMeasures",
  quickEntryPreviewSections: "maxPreviewSections",
  quickEntryDiagnostics: "maxPreviewDiagnostics",
  quickEntryIssueCodes: "maxQuickEntryIssueCodes",
  quickEntryIssueCodeText: "maxIssueCodeCodePoints",
  chartSections: "maxRenderedSections",
  chartMeasures: "maxRenderedMeasures",
  chartEvents: "maxRenderedEvents",
  selectionEventIds: "maxSelectedEventIds",
  inlineSymbolDraft: "maxSymbolDraftCodePoints",
  sectionNameDraft: "maxSectionNameCodePoints",
  sectionAnnotationDraft: "maxSectionAnnotationCodePoints",
  completionReasonDraft: "maxCompletionReasonCodePoints",
  rangeBeatFieldText: "maxExactBeatCodePoints",
  cardMenuItems: "maxCardMenuItems",
  cardMenuDepth: "maxCardMenuDepth",
  undoDescription: "maxUndoLabelCodePoints",
  refusalMessage: "maxRefusalMessageCodePoints",
} as const satisfies Readonly<Record<string, U1EditingLimitKey>>);

/**
 * Work is bounded by rendered collections; no U1 surface may use elapsed wall
 * time as a musical or correctness cutoff.
 */
export const U1_WORK_BOUNDS = /* @__PURE__ */ Object.freeze({
  previewTokenVisits: "at-most-maxPreviewTokens-per-draft-change",
  chartCardVisits: "at-most-maxRenderedEvents-per-render",
  rovingFocusVisits: "at-most-maxRenderedEvents-per-focus-transition",
  measureFillRecomputation:
    "at-most-the-target-measure-event-count-per-duration-preview",
  dragSessionListeners: "at-most-transientDragListenersPerSession-and-released",
  commandsPerUserAction: "exactly-maxCommandsPerUserAction",
  wallTimeCutoff: "forbidden",
} as const);

/* -------------------------------------------------------------------------- */
/* Application channels                                                        */
/* -------------------------------------------------------------------------- */

export const U1_MUTATION_CHANNELS = /* @__PURE__ */ Object.freeze([
  "document-command",
  "ephemeral-intent",
  "presentation-only",
] as const);

export type U1MutationChannel = (typeof U1_MUTATION_CHANNELS)[number];

/**
 * The exact subset of the live sixteen A0 command kinds U1 may dispatch. The
 * static contract test proves this list is a subset of the live
 * `APPLICATION_COMMAND_KINDS` tuple and that the excluded kinds stay excluded.
 */
export const U1_AUTHORIZED_COMMAND_KINDS = /* @__PURE__ */ Object.freeze([
  "insert",
  "delete",
  "move",
  "duplicate",
  "set-text",
  "set-duration",
  "set-measure-completion",
  "set-section",
  "set-chord",
  "apply-edit-plan",
] as const);

export type U1AuthorizedCommandKind =
  (typeof U1_AUTHORIZED_COMMAND_KINDS)[number];

/** Kinds that exist in A0 but that no U1 surface is allowed to dispatch. */
export const U1_UNAUTHORIZED_COMMAND_KINDS = /* @__PURE__ */ Object.freeze([
  "set-voicing",
  "set-document-settings",
  "transpose",
  "apply-suggestion",
  "apply-reharmonization",
  "replace-document",
] as const);

export const U1_AUTHORIZED_EPHEMERAL_INTENT_KINDS =
  /* @__PURE__ */ Object.freeze(["set-bookmarks", "set-quick-entry"] as const);

export type U1AuthorizedEphemeralIntentKind =
  (typeof U1_AUTHORIZED_EPHEMERAL_INTENT_KINDS)[number];

/** The six closed A0/U1 atomic plan kinds U1 composes. */
export const U1_AUTHORIZED_EDIT_PLAN_KINDS = /* @__PURE__ */ Object.freeze([
  "insert-fragment",
  "split-event-duration",
  "join-event-durations",
  "split-section",
  "join-sections",
  "split-measure",
] as const);

export type U1AuthorizedEditPlanKind =
  (typeof U1_AUTHORIZED_EDIT_PLAN_KINDS)[number];

export const U1_TEXT_FIELD_TARGET_KINDS = /* @__PURE__ */ Object.freeze([
  "section-name",
  "section-annotation",
] as const);

/* -------------------------------------------------------------------------- */
/* Operation inventory                                                         */
/* -------------------------------------------------------------------------- */

export const U1_KEYBOARD_ACCESS_KINDS = /* @__PURE__ */ Object.freeze([
  "shortcut",
  "menu-item",
  "text-entry",
] as const);

export type U1KeyboardAccess = (typeof U1_KEYBOARD_ACCESS_KINDS)[number];

export type U1OperationContract = Readonly<{
  id: string;
  operation: string;
  surface: U1EditingSurface;
  channel: U1MutationChannel;
  commandKind: U1AuthorizedCommandKind | null;
  planKind: U1AuthorizedEditPlanKind | null;
  intentKind: U1AuthorizedEphemeralIntentKind | null;
  undoable: boolean;
  pointerAlternative: "keyboard-and-menu" | "keyboard" | "none";
  keyboardAccess: U1KeyboardAccess;
}>;

/**
 * Closed inventory. Every U1 gesture, key, and menu item resolves to exactly
 * one row; a row resolves to at most one application command or intent.
 */
export const U1_EDIT_OPERATIONS = /* @__PURE__ */ Object.freeze([
  {
    id: "U1-OP-001",
    operation: "quick-entry-edit-draft",
    surface: "quick-entry",
    channel: "ephemeral-intent",
    commandKind: null,
    planKind: null,
    intentKind: "set-quick-entry",
    undoable: false,
    pointerAlternative: "keyboard",
    keyboardAccess: "text-entry",
  },
  {
    id: "U1-OP-002",
    operation: "quick-entry-set-target",
    surface: "quick-entry",
    channel: "ephemeral-intent",
    commandKind: null,
    planKind: null,
    intentKind: "set-quick-entry",
    undoable: false,
    pointerAlternative: "keyboard-and-menu",
    keyboardAccess: "menu-item",
  },
  {
    id: "U1-OP-003",
    operation: "quick-entry-clear-draft",
    surface: "quick-entry",
    channel: "ephemeral-intent",
    commandKind: null,
    planKind: null,
    intentKind: "set-quick-entry",
    undoable: false,
    pointerAlternative: "keyboard",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-004",
    operation: "quick-entry-insert-preview",
    surface: "quick-entry",
    channel: "document-command",
    commandKind: "apply-edit-plan",
    planKind: "insert-fragment",
    intentKind: null,
    undoable: true,
    pointerAlternative: "keyboard",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-005",
    operation: "quick-entry-insert-one-chord",
    surface: "quick-entry",
    channel: "document-command",
    commandKind: "apply-edit-plan",
    planKind: "insert-fragment",
    intentKind: null,
    undoable: true,
    pointerAlternative: "keyboard",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-006",
    operation: "insert-empty-measure",
    surface: "chart",
    channel: "document-command",
    commandKind: "insert",
    planKind: null,
    intentKind: null,
    undoable: true,
    pointerAlternative: "keyboard-and-menu",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-007",
    operation: "insert-empty-section",
    surface: "chart",
    channel: "document-command",
    commandKind: "insert",
    planKind: null,
    intentKind: null,
    undoable: true,
    pointerAlternative: "keyboard-and-menu",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-008",
    operation: "delete-selection",
    surface: "chart",
    channel: "document-command",
    commandKind: "delete",
    planKind: null,
    intentKind: null,
    undoable: true,
    pointerAlternative: "keyboard-and-menu",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-009",
    operation: "duplicate-selection",
    surface: "chart",
    channel: "document-command",
    commandKind: "duplicate",
    planKind: null,
    intentKind: null,
    undoable: true,
    pointerAlternative: "keyboard-and-menu",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-010",
    operation: "move-previous",
    surface: "chart",
    channel: "document-command",
    commandKind: "move",
    planKind: null,
    intentKind: null,
    undoable: true,
    pointerAlternative: "keyboard-and-menu",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-011",
    operation: "move-next",
    surface: "chart",
    channel: "document-command",
    commandKind: "move",
    planKind: null,
    intentKind: null,
    undoable: true,
    pointerAlternative: "keyboard-and-menu",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-012",
    operation: "move-to-boundary",
    surface: "chart",
    channel: "document-command",
    commandKind: "move",
    planKind: null,
    intentKind: null,
    undoable: true,
    pointerAlternative: "keyboard-and-menu",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-013",
    operation: "move-following-events",
    surface: "chart",
    channel: "document-command",
    commandKind: "move",
    planKind: null,
    intentKind: null,
    undoable: true,
    pointerAlternative: "keyboard-and-menu",
    keyboardAccess: "menu-item",
  },
  {
    id: "U1-OP-014",
    operation: "split-event-duration",
    surface: "chart",
    channel: "document-command",
    commandKind: "apply-edit-plan",
    planKind: "split-event-duration",
    intentKind: null,
    undoable: true,
    pointerAlternative: "keyboard-and-menu",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-015",
    operation: "join-event-durations",
    surface: "chart",
    channel: "document-command",
    commandKind: "apply-edit-plan",
    planKind: "join-event-durations",
    intentKind: null,
    undoable: true,
    pointerAlternative: "keyboard-and-menu",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-016",
    operation: "split-section",
    surface: "chart",
    channel: "document-command",
    commandKind: "apply-edit-plan",
    planKind: "split-section",
    intentKind: null,
    undoable: true,
    pointerAlternative: "keyboard-and-menu",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-017",
    operation: "join-sections",
    surface: "chart",
    channel: "document-command",
    commandKind: "apply-edit-plan",
    planKind: "join-sections",
    intentKind: null,
    undoable: true,
    pointerAlternative: "keyboard-and-menu",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-018",
    operation: "set-event-duration",
    surface: "chart",
    channel: "document-command",
    commandKind: "set-duration",
    planKind: null,
    intentKind: null,
    undoable: true,
    pointerAlternative: "keyboard-and-menu",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-019",
    operation: "set-measure-completion",
    surface: "chart",
    channel: "document-command",
    commandKind: "set-measure-completion",
    planKind: null,
    intentKind: null,
    undoable: true,
    pointerAlternative: "keyboard-and-menu",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-020",
    operation: "apply-inline-symbol",
    surface: "chart",
    channel: "document-command",
    commandKind: "set-chord",
    planKind: null,
    intentKind: null,
    undoable: true,
    pointerAlternative: "keyboard-and-menu",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-021",
    operation: "rename-section",
    surface: "chart",
    channel: "document-command",
    commandKind: "set-text",
    planKind: null,
    intentKind: null,
    undoable: true,
    pointerAlternative: "keyboard",
    keyboardAccess: "text-entry",
  },
  {
    id: "U1-OP-022",
    operation: "annotate-section",
    surface: "chart",
    channel: "document-command",
    commandKind: "set-text",
    planKind: null,
    intentKind: null,
    undoable: true,
    pointerAlternative: "keyboard",
    keyboardAccess: "text-entry",
  },
  {
    id: "U1-OP-023",
    operation: "set-section-boundary",
    surface: "chart",
    channel: "document-command",
    commandKind: "set-section",
    planKind: null,
    intentKind: null,
    undoable: true,
    pointerAlternative: "keyboard-and-menu",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-024",
    operation: "select-event",
    surface: "chart",
    channel: "ephemeral-intent",
    commandKind: null,
    planKind: null,
    intentKind: "set-bookmarks",
    undoable: false,
    pointerAlternative: "keyboard",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-025",
    operation: "extend-selection",
    surface: "chart",
    channel: "ephemeral-intent",
    commandKind: null,
    planKind: null,
    intentKind: "set-bookmarks",
    undoable: false,
    pointerAlternative: "keyboard",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-026",
    operation: "set-insertion-point",
    surface: "chart",
    channel: "ephemeral-intent",
    commandKind: null,
    planKind: null,
    intentKind: "set-bookmarks",
    undoable: false,
    pointerAlternative: "keyboard",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-027",
    operation: "range-enter-mode",
    surface: "range",
    channel: "presentation-only",
    commandKind: null,
    planKind: null,
    intentKind: null,
    undoable: false,
    pointerAlternative: "keyboard",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-028",
    operation: "range-set-start",
    surface: "range",
    channel: "ephemeral-intent",
    commandKind: null,
    planKind: null,
    intentKind: "set-bookmarks",
    undoable: false,
    pointerAlternative: "keyboard",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-029",
    operation: "range-set-end",
    surface: "range",
    channel: "ephemeral-intent",
    commandKind: null,
    planKind: null,
    intentKind: "set-bookmarks",
    undoable: false,
    pointerAlternative: "keyboard",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-030",
    operation: "range-clear",
    surface: "range",
    channel: "ephemeral-intent",
    commandKind: null,
    planKind: null,
    intentKind: "set-bookmarks",
    undoable: false,
    pointerAlternative: "keyboard",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-031",
    operation: "toggle-view-mode",
    surface: "view",
    channel: "presentation-only",
    commandKind: null,
    planKind: null,
    intentKind: null,
    undoable: false,
    pointerAlternative: "keyboard",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-032",
    operation: "open-card-menu",
    surface: "chart",
    channel: "presentation-only",
    commandKind: null,
    planKind: null,
    intentKind: null,
    undoable: false,
    pointerAlternative: "keyboard",
    keyboardAccess: "shortcut",
  },
  {
    id: "U1-OP-033",
    operation: "cancel-inline-edit",
    surface: "chart",
    channel: "presentation-only",
    commandKind: null,
    planKind: null,
    intentKind: null,
    undoable: false,
    pointerAlternative: "keyboard",
    keyboardAccess: "shortcut",
  },
  /*
   * The third overfill resolution, appended rather than placed beside
   * U1-OP-013 so every accepted operation index still names its own row.
   * REBUILD_PLAN 17.4 requires a duration edit that overfills a measure to
   * offer Split at bar, Move following events (U1-OP-013), or Cancel
   * (U1-OP-031). Split at bar is one atomic, singly undoable split-measure
   * command; it is reached from the overfill notice, so like its sibling it is
   * a menu item rather than a shortcut.
   */
  {
    id: "U1-OP-034",
    operation: "split-at-bar",
    surface: "chart",
    channel: "document-command",
    commandKind: "apply-edit-plan",
    planKind: "split-measure",
    intentKind: null,
    undoable: true,
    pointerAlternative: "keyboard-and-menu",
    keyboardAccess: "menu-item",
  },
] as const satisfies readonly U1OperationContract[]);

export type U1EditOperationId = (typeof U1_EDIT_OPERATIONS)[number]["id"];
export type U1EditOperation = (typeof U1_EDIT_OPERATIONS)[number]["operation"];

export const U1_EDIT_OPERATION_COUNT = 34;

/* -------------------------------------------------------------------------- */
/* Quick entry                                                                 */
/* -------------------------------------------------------------------------- */

export const U1_QUICK_ENTRY_STATUSES = /* @__PURE__ */ Object.freeze([
  "idle",
  "invalid",
  "ready",
] as const);

export type U1QuickEntryStatus = (typeof U1_QUICK_ENTRY_STATUSES)[number];

export const U1_QUICK_ENTRY_LANES = /* @__PURE__ */ Object.freeze([
  "complete-draft",
  "recovered-chord",
] as const);

export type U1QuickEntryLane = (typeof U1_QUICK_ENTRY_LANES)[number];

export const U1_TOKEN_STATES = /* @__PURE__ */ Object.freeze([
  "valid",
  "invalid",
  "insertable",
] as const);

export type U1TokenState = (typeof U1_TOKEN_STATES)[number];

export const U1_INSERTION_PLAN_KINDS = /* @__PURE__ */ Object.freeze([
  "fits-measure",
  "completes-measures",
  "incomplete-requires-confirmation",
  "overfill-requires-split",
  "not-atomic-refusal",
] as const);

export type U1InsertionPlanKind = (typeof U1_INSERTION_PLAN_KINDS)[number];

export type U1InsertionPlanContract = Readonly<{
  kind: U1InsertionPlanKind;
  committableInV1: boolean;
  planKind: U1AuthorizedEditPlanKind | null;
  lane: U1QuickEntryLane | null;
  placement: "into-measure" | "into-section" | "into-document" | null;
  blockedReason: string | null;
  resolutions: readonly string[];
}>;

/**
 * Deterministic preview classification. It is presentation, not publication:
 * A0 remains the sole publisher, and a disagreement between this statement and
 * the A0 outcome is always resolved in favor of the A0 receipt or refusal,
 * which U1 must surface verbatim.
 */
export const U1_INSERTION_PLAN_AUTHORITY = /* @__PURE__ */ Object.freeze([
  {
    kind: "fits-measure",
    committableInV1: true,
    planKind: "insert-fragment",
    lane: "complete-draft",
    placement: "into-measure",
    blockedReason: null,
    resolutions: ["insert-parsed-preview"],
  },
  {
    kind: "completes-measures",
    committableInV1: true,
    planKind: "insert-fragment",
    lane: "complete-draft",
    placement: "into-section",
    blockedReason: null,
    resolutions: ["insert-parsed-preview"],
  },
  {
    kind: "incomplete-requires-confirmation",
    committableInV1: false,
    planKind: null,
    lane: null,
    placement: null,
    blockedReason: "u1.insertion_plan_requires_confirmation",
    resolutions: [
      "complete-the-final-measure",
      "insert-one-recovered-chord-into-a-measure",
      "cancel",
    ],
  },
  {
    kind: "overfill-requires-split",
    committableInV1: false,
    planKind: null,
    lane: null,
    placement: null,
    blockedReason: "u1.insertion_plan_overfills_destination",
    resolutions: [
      "choose-an-empty-measure-or-structural-boundary",
      "shorten-the-draft",
      "cancel",
    ],
  },
  {
    kind: "not-atomic-refusal",
    committableInV1: false,
    planKind: null,
    lane: null,
    placement: null,
    blockedReason: "u1.insertion_plan_not_atomic",
    resolutions: ["correct-the-draft", "cancel"],
  },
] as const satisfies readonly U1InsertionPlanContract[]);

/**
 * Named-section drafts reach the document placement. The classification is the
 * same `completes-measures` statement; the placement differs and is reported
 * separately so a preview never claims a measure-level insertion it will not
 * perform.
 */
export const U1_DOCUMENT_PLACEMENT_POLICY = /* @__PURE__ */ Object.freeze({
  namedSectionDraft: "insert-new-sections-before-the-target-or-append",
  existingSectionNameCollision: "warn-and-still-create-a-new-section",
  sectionMergeInV1: "deferred",
} as const);

/* -------------------------------------------------------------------------- */
/* Measure fill for duration edits                                             */
/* -------------------------------------------------------------------------- */

export const U1_MEASURE_FILL_KINDS = /* @__PURE__ */ Object.freeze([
  "exact-fill",
  "underfill-requires-reason",
  "overfill-requires-resolution",
] as const);

export type U1MeasureFillKind = (typeof U1_MEASURE_FILL_KINDS)[number];

export const U1_MEASURE_FILL_AUTHORITY = /* @__PURE__ */ Object.freeze([
  {
    kind: "exact-fill",
    completion: "complete",
    committableInV1: true,
    resolutions: ["apply-duration"],
  },
  {
    kind: "underfill-requires-reason",
    completion: "incomplete",
    committableInV1: true,
    resolutions: ["declare-incomplete-measure-with-reason", "cancel"],
  },
  /*
   * REBUILD_PLAN 17.4's three options, in its order. `split-at-bar` became
   * expressible when the sixth atomic plan variant landed (`split-measure`);
   * before that this row could offer only Move or Cancel, which was honest and
   * incomplete against the plan. Still not committable: the overfill is stated
   * with its exact current fill, resulting fill, and bar capacity, and the user
   * chooses. Nothing is silently rebalanced and no beat is dropped.
   */
  {
    kind: "overfill-requires-resolution",
    completion: null,
    committableInV1: false,
    resolutions: [
      "split-at-bar",
      "move-following-events",
      "shorten-the-duration",
      "cancel",
    ],
  },
] as const);

/** The first release never synthesizes a rest to absorb an underfilled bar. */
export const U1_REST_SYNTHESIS_POLICY = "forbidden-no-rest-model-in-v1";

/* -------------------------------------------------------------------------- */
/* Bookmarks, focus, pointer, keyboard                                         */
/* -------------------------------------------------------------------------- */

export const U1_BOOKMARK_CONCEPTS = /* @__PURE__ */ Object.freeze([
  { concept: "selection", owner: "bookmarks.selection", movesPlayhead: false },
  { concept: "insertion", owner: "bookmarks.insertion", movesPlayhead: false },
  { concept: "range", owner: "bookmarks.range", movesPlayhead: false },
  { concept: "playhead", owner: "transport.playhead", movesPlayhead: true },
] as const);

export const U1_BOOKMARK_INDEPENDENCE_POLICY = /* @__PURE__ */ Object.freeze({
  selectionMovesPlayhead: false,
  previewChangesSelection: false,
  playbackChangesSelection: false,
  selectionChangesInsertion: false,
  rangeChangesSelection: false,
} as const);

/** Inherited A0 focus priority; U1 never reads or infers current DOM focus. */
export const U1_FOCUS_PRIORITY = /* @__PURE__ */ Object.freeze([
  "selection-focus-event",
  "non-chart-insertion-target",
  "first-inserted-structural-ref",
  "chart",
] as const);

/** Focus repair after the focused event is deleted. */
export const U1_DELETE_FOCUS_REPAIR_ORDER = /* @__PURE__ */ Object.freeze([
  "next-event",
  "previous-event",
  "section-insertion-target",
] as const);

export const U1_POINTER_POLICY = /* @__PURE__ */ Object.freeze({
  dragIsOptionalEnhancement: true,
  dragHandleRequired: true,
  dragThresholdCssPx: 8,
  preventDefaultBeforeThreshold: false,
  preventDefaultAfterThreshold: true,
  pointerCaptureReleasedOnCancel: true,
  pointerCaptureReleasedOnUnmount: true,
  listenersScopedToComponent: true,
  listenersMultipliedByDocumentMutation: false,
  hoverOnlyPrimaryActions: "forbidden",
} as const);

export const U1_TOUCH_RANGE_ACTIONS = /* @__PURE__ */ Object.freeze([
  "select-range",
  "set-start",
  "set-end",
  "start-beat-field",
  "end-beat-field",
  "done",
  "cancel",
] as const);

export type U1KeyBindingContract = Readonly<{
  keys: string;
  operationId: U1EditOperationId;
  scope: "chart" | "chord-card" | "quick-entry" | "range";
}>;

/** Every pointer-driven operation has at least one binding here or a menu item. */
export const U1_KEY_BINDINGS = /* @__PURE__ */ Object.freeze([
  { keys: "ArrowLeft", operationId: "U1-OP-032", scope: "chart" },
  { keys: "ArrowRight", operationId: "U1-OP-032", scope: "chart" },
  { keys: "ArrowUp", operationId: "U1-OP-032", scope: "chart" },
  { keys: "ArrowDown", operationId: "U1-OP-032", scope: "chart" },
  { keys: "Home", operationId: "U1-OP-032", scope: "chart" },
  { keys: "End", operationId: "U1-OP-032", scope: "chart" },
  { keys: "Enter", operationId: "U1-OP-024", scope: "chord-card" },
  { keys: "Space", operationId: "U1-OP-024", scope: "chord-card" },
  { keys: "Shift+ArrowLeft", operationId: "U1-OP-025", scope: "chord-card" },
  { keys: "Shift+ArrowRight", operationId: "U1-OP-025", scope: "chord-card" },
  { keys: "F2", operationId: "U1-OP-020", scope: "chord-card" },
  { keys: "Escape", operationId: "U1-OP-033", scope: "chord-card" },
  { keys: "Delete", operationId: "U1-OP-008", scope: "chord-card" },
  { keys: "Backspace", operationId: "U1-OP-008", scope: "chord-card" },
  { keys: "Alt+D", operationId: "U1-OP-009", scope: "chord-card" },
  { keys: "Alt+ArrowLeft", operationId: "U1-OP-010", scope: "chord-card" },
  { keys: "Alt+ArrowRight", operationId: "U1-OP-011", scope: "chord-card" },
  { keys: "Alt+M", operationId: "U1-OP-012", scope: "chord-card" },
  { keys: "Alt+S", operationId: "U1-OP-014", scope: "chord-card" },
  { keys: "Alt+J", operationId: "U1-OP-015", scope: "chord-card" },
  { keys: "Alt+T", operationId: "U1-OP-018", scope: "chord-card" },
  { keys: "Alt+I", operationId: "U1-OP-006", scope: "chart" },
  { keys: "Alt+N", operationId: "U1-OP-007", scope: "chart" },
  { keys: "Alt+K", operationId: "U1-OP-016", scope: "chart" },
  { keys: "Alt+L", operationId: "U1-OP-017", scope: "chart" },
  { keys: "Alt+C", operationId: "U1-OP-019", scope: "chart" },
  { keys: "Alt+B", operationId: "U1-OP-023", scope: "chart" },
  { keys: "Alt+P", operationId: "U1-OP-026", scope: "chart" },
  { keys: "Alt+R", operationId: "U1-OP-027", scope: "range" },
  { keys: "Alt+V", operationId: "U1-OP-031", scope: "chart" },
  { keys: "Shift+F10", operationId: "U1-OP-032", scope: "chord-card" },
  { keys: "ContextMenu", operationId: "U1-OP-032", scope: "chord-card" },
  { keys: "Enter", operationId: "U1-OP-004", scope: "quick-entry" },
  { keys: "Alt+Enter", operationId: "U1-OP-005", scope: "quick-entry" },
  { keys: "Escape", operationId: "U1-OP-003", scope: "quick-entry" },
  { keys: "Home", operationId: "U1-OP-028", scope: "range" },
  { keys: "End", operationId: "U1-OP-029", scope: "range" },
  { keys: "Escape", operationId: "U1-OP-030", scope: "range" },
] as const satisfies readonly U1KeyBindingContract[]);

export const U1_VIEW_MODES = /* @__PURE__ */ Object.freeze([
  "compact",
  "teaching",
] as const);

export type U1ViewMode = (typeof U1_VIEW_MODES)[number];

export const U1_VIEW_MODE_POLICY = /* @__PURE__ */ Object.freeze({
  owner: "u1-presentation-state",
  mutatesDocument: false,
  mutatesBookmarks: false,
  persisted: false,
  identicalMusicalFacts: true,
} as const);

/** Chord cards are keyed by stable identity, never by array position. */
export const U1_IDENTITY_POLICY = /* @__PURE__ */ Object.freeze({
  chartKeys: "stable-domain-ids-only",
  indexKeys: "forbidden",
  focusFollowsStableId: true,
  reorderPreservesSelection: true,
  reorderPreservesPlaybackIdentity: true,
} as const);

/** Inline editing never coerces or silently discards caller text. */
export const U1_INLINE_EDIT_POLICY = /* @__PURE__ */ Object.freeze({
  rawTextOwner: "component-local-draft",
  commitTrigger: "enter-or-apply",
  commitRequiresValidParse: true,
  escapeRestoresExactPriorText: true,
  blurCommits: false,
  blurCoercesInvalidText: false,
  dirtyDraftSwitchAway: "prompt-apply-discard-or-continue",
  manualOrFrozenVoicing: "inline-symbol-edit-disabled-with-named-reason",
} as const);

/* -------------------------------------------------------------------------- */
/* Refusals                                                                    */
/* -------------------------------------------------------------------------- */

export const U1_REFUSAL_CODES = /* @__PURE__ */ Object.freeze([
  "u1.draft_code_points_exceeded",
  "u1.draft_unicode_invalid",
  "u1.preview_token_limit",
  "u1.quick_entry_target_missing",
  "u1.quick_entry_stale_revision",
  "u1.quick_entry_lane_mismatch",
  "u1.insertion_plan_requires_confirmation",
  "u1.insertion_plan_overfills_destination",
  "u1.insertion_plan_not_atomic",
  "u1.symbol_draft_invalid",
  "u1.symbol_edit_blocked_manual_voicing",
  "u1.duration_invalid",
  "u1.duration_overfills_measure",
  "u1.completion_reason_required",
  "u1.split_partition_invalid",
  "u1.join_requires_adjacent_events",
  "u1.join_right_annotation_not_empty",
  "u1.section_split_boundary_invalid",
  "u1.measure_split_boundary_invalid",
  "u1.section_join_requires_adjacent_sections",
  "u1.move_destination_invalid",
  "u1.selection_limit",
  "u1.selection_empty",
  "u1.range_boundary_invalid",
  "u1.range_endpoints_unordered",
  "u1.target_missing",
] as const);

export type U1RefusalCode = (typeof U1_REFUSAL_CODES)[number];

/**
 * A0 refusals are surfaced verbatim. U1 never rewrites an application refusal
 * code into a U1 code, never retries a refused command, and never presents a
 * refusal as a success.
 */
export const U1_REFUSAL_SURFACING_POLICY = /* @__PURE__ */ Object.freeze({
  applicationRefusalCode: "preserved-verbatim",
  editPlanRefusalCode: "preserved-verbatim",
  syntaxDiagnosticCodeAndRange: "preserved-verbatim",
  silentRetry: "forbidden",
  downgradeToSuccess: "forbidden",
  u1CodesDescribePreDispatchGuardsOnly: true,
} as const);

/* -------------------------------------------------------------------------- */
/* Laws                                                                        */
/* -------------------------------------------------------------------------- */

export const U1_LAW_IDS = /* @__PURE__ */ Object.freeze([
  "U1-EDIT-001-no-new-mutation-channel",
  "U1-EDIT-002-draft-text-is-caller-owned-and-exact",
  "U1-EDIT-003-preview-status-is-t0-derived",
  "U1-EDIT-004-insertion-plan-statement-exact",
  "U1-EDIT-005-whole-preview-apply-is-one-atomic-command",
  "U1-EDIT-006-recovered-chord-lane-requires-explicit-loss-acknowledgement",
  "U1-EDIT-007-stable-identity-keys-only",
  "U1-EDIT-008-four-independent-bookmarks",
  "U1-EDIT-009-roving-focus-visual-order-stable-across-reorder",
  "U1-EDIT-010-delete-focus-repair-order",
  "U1-EDIT-011-inline-symbol-edit-valid-on-apply",
  "U1-EDIT-012-duration-edit-states-measure-fill-and-explicit-resolution",
  "U1-EDIT-013-pointer-drag-optional-and-threshold-gated",
  "U1-EDIT-014-keyboard-or-menu-alternative-for-every-pointer-operation",
  "U1-EDIT-015-listener-counts-constant-across-mount-reorder-and-mutation",
  "U1-EDIT-016-touch-range-mode-explicit-and-exact",
  "U1-EDIT-017-application-refusals-surfaced-verbatim",
  "U1-EDIT-018-view-modes-render-identical-musical-facts",
] as const);

export type U1LawId = (typeof U1_LAW_IDS)[number];

export const U1_LAW_COUNT = 18;

export const U1_FORBIDDEN_SHORTCUTS = /* @__PURE__ */ Object.freeze([
  "array-index-keys-for-chart-nodes",
  "drag-required-authoring",
  "silent-beat-loss",
  "silent-measure-rebalance",
  "synthesized-hidden-rests",
  "blur-coerced-invalid-symbol-text",
  "second-syntax-classifier-in-ui",
  "direct-document-mutation-from-ui",
  "batched-or-nested-application-commands-per-gesture",
  "wall-time-as-a-musical-or-correctness-cutoff",
  "mock-only-substitute-for-a-named-browser-gate",
  "listener-registration-per-document-mutation",
] as const);

/* -------------------------------------------------------------------------- */
/* View and callback types                                                     */
/* -------------------------------------------------------------------------- */

export type U1ExactBeatLabel = string;

export type U1QuickEntryTokenView = Readonly<{
  ordinal: number;
  sourceText: string;
  state: U1TokenState;
  diagnosticCode: string | null;
  globalOrdinal: number | null;
  durationLabel: U1ExactBeatLabel | null;
  insertable: boolean;
}>;

export type U1InsertionPlanView = Readonly<{
  kind: U1InsertionPlanKind;
  statement: string;
  committable: boolean;
  blockedReason: string | null;
  resolutions: readonly string[];
  targetLabel: string;
}>;

export type U1QuickEntryView = Readonly<{
  draftText: string;
  status: U1QuickEntryStatus;
  lane: U1QuickEntryLane | null;
  baseRevision: number;
  targetLabel: string | null;
  tokens: readonly U1QuickEntryTokenView[];
  diagnostics: readonly UiDiagnostic[];
  issueCodes: readonly string[];
  insertionPlan: U1InsertionPlanView | null;
  canInsertPreview: boolean;
  canInsertOneChord: boolean;
  sectionNameCollisionWarnings: readonly string[];
}>;

export type U1ChordCardView = Readonly<{
  eventId: string;
  ordinal: number;
  symbolText: string;
  canonicalSymbolText: string;
  durationLabel: U1ExactBeatLabel;
  romanLabel: string | null;
  voicingMode: "auto" | "manual" | "frozen";
  hasAnnotation: boolean;
  selected: boolean;
  focused: boolean;
  inRange: boolean;
  underPlayhead: boolean;
  inlineEditable: boolean;
  inlineEditBlockedReason: string | null;
}>;

export type U1MeasureEditView = Readonly<{
  measureId: string;
  ordinal: number;
  capacityLabel: U1ExactBeatLabel;
  filledLabel: U1ExactBeatLabel;
  fill: U1MeasureFillKind;
  completionLabel: string;
  cards: readonly U1ChordCardView[];
  insertionTargetIds: readonly string[];
}>;

export type U1SectionEditView = Readonly<{
  sectionId: string;
  name: string;
  annotation: string | null;
  voiceLeadingBoundaryLabel: string;
  measures: readonly U1MeasureEditView[];
  insertionTargetIds: readonly string[];
}>;

export type U1ChartEditView = Readonly<{
  viewMode: U1ViewMode;
  density: UiDensity;
  sections: readonly U1SectionEditView[];
  rovingFocusId: string | null;
  selectionCount: number;
  rangeStartLabel: U1ExactBeatLabel | null;
  rangeEndLabel: U1ExactBeatLabel | null;
  rangeModeActive: boolean;
  refusal: UiDiagnostic | null;
  undoDescription: string;
  redoDescription: string;
}>;

export type U1EditingView = Readonly<{
  quickEntry: U1QuickEntryView;
  chart: U1ChartEditView;
}>;

export type U1EditRequest = Readonly<{
  operationId: U1EditOperationId;
  source: UiInteractionSource;
  expectedDocumentId: string;
  expectedRevision: number;
}>;

export type U1EditingCallbacks = Readonly<{
  onQuickEntryDraftChange: (value: string) => void;
  onQuickEntryClear: () => void;
  onQuickEntryTargetChange: (boundaryId: string) => void;
  onInsertPreview: (request: U1EditRequest) => void;
  onInsertOneChord: (request: U1EditRequest, globalOrdinal: number) => void;
  onSelectEvent: (request: U1EditRequest, eventId: string) => void;
  onExtendSelection: (request: U1EditRequest, eventId: string) => void;
  onSetInsertionPoint: (request: U1EditRequest, boundaryId: string) => void;
  onRangeAction: (
    request: U1EditRequest,
    action: (typeof U1_TOUCH_RANGE_ACTIONS)[number],
  ) => void;
  onStructuralEdit: (request: U1EditRequest, targetId: string) => void;
  onApplyInlineSymbol: (request: U1EditRequest, symbolText: string) => void;
  onApplyDuration: (request: U1EditRequest, beatText: string) => void;
  onDeclareCompletion: (request: U1EditRequest, reason: string) => void;
  onViewModeChange: (mode: U1ViewMode) => void;
  onEditRefusal: (diagnostic: UiDiagnostic) => void;
}>;

export type U1EditingProps = Readonly<{
  view: U1EditingView;
  callbacks: U1EditingCallbacks;
}>;
