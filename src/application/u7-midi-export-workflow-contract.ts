/**
 * U7 MIDI export workflow contract — proposed independent specification.
 *
 * This module is the code-facing U7 authority. It freezes the MIDI export
 * workflow's state machine, preview model, derivation laws, refusal and
 * outcome vocabulary, limits, component inventory, accessibility matrix
 * vocabulary, and channel discipline for the future dialog/sheet that lets a
 * user inspect, generate, and download the Standard MIDI File of the current
 * validated chart.
 *
 * Boundary: U7 lives in the `application` layer (it must name E1 export and
 * P0 playback types, and `ui` may not import `export`). The UI half is
 * expressed as view-model types and the frozen component/a11y vocabulary a
 * future `ui` surface renders. This module is imported by NOTHING in
 * production: it is a proposed packet, exactly like the A0/E0 owner-bridge
 * packet. The independently authored expectations live under
 * `tests/fixtures/midi-export-workflow/`; the production implementation may be
 * compared with them but may never generate, rewrite, or bless them.
 *
 * Upstream authorities are bound by literal restatement, never by import of
 * mutable surface: the static contract test proves every restated constant
 * equals the live upstream pin (E1, P0, A0, U0, domain). If an upstream pin
 * ever moves, this packet alarms instead of silently drifting.
 *
 * Non-claims (pinned in the fixture manifest and enforced by the validator):
 * no production implementation, no UI completion, no human acceptance, and no
 * expert review is claimed by this packet.
 */
import type { AppRevision } from "./application-state-contract";
import type { ChordEventId, DocumentId } from "../domain";
import type {
  MidiExportLossKind,
  MidiExportRefusalCode,
} from "../export";

export const U7_MIDI_EXPORT_WORKFLOW_CONTRACT_SCHEMA =
  "changes.application.u7-midi-export-workflow-contract.v1";
export const U7_MIDI_EXPORT_WORKFLOW_PACKAGE = "U7";
export const U7_MIDI_EXPORT_WORKFLOW_POLICY_ID =
  "changes.u7-midi-export-workflow";
export const U7_MIDI_EXPORT_WORKFLOW_POLICY_VERSION = 1;
export const U7_MIDI_EXPORT_WORKFLOW_BEAD_ID =
  "jcpe-milestone-advanced-craft-ulj.11.1";

/**
 * The code-facing status of the U7 surface. No production component exists;
 * the fixture packet reads `specified-not-implemented` with all four claim
 * flags false so it can never be read as evidence for the code it exists to
 * judge. Moving those flags is a change to the reviewed packet and needs a
 * recorded human acceptance.
 */
export const U7_MIDI_EXPORT_WORKFLOW_IMPLEMENTATION_STATUS =
  "specified-not-implemented";

/* -------------------------------------------------------------------------- */
/* Upstream pins (restated literals; the static test binds them to the live   */
/* authorities: src/export/midi-export-contract.ts,                          */
/* src/playback/playback-plan-contract.ts, src/domain/document.ts,           */
/* src/application/application-state-contract.ts, src/ui/ui-contract.ts).     */
/* -------------------------------------------------------------------------- */

/** E1 writer identity the workflow report must echo. */
export const U7_E1_WRITER_ID = "changes.midi-export";
export const U7_E1_WRITER_VERSION = 1;
export const U7_E1_WRITER_VERSION_TAG = "changes.midi-export.v1";

/** P0/E1 byte-model pins the preview discloses verbatim. */
export const U7_MIDI_PPQ = 960;
export const U7_MIDI_TRACK_COUNT = 2;

/** E1 text law: UTF-8, 1..96 bytes, no ASCII control characters. */
export const U7_MAX_MARKER_TEXT_UTF8_BYTES = 96;

/** E1 filename law pins. */
export const U7_FILENAME_PREFIX = "changes-";
export const U7_FILENAME_SUFFIX = ".mid";
export const U7_FILENAME_MAX_CHARACTERS = 64;

/** Domain caps that make marker overflow unreachable by construction. */
export const U7_MAX_DOCUMENT_CHORD_EVENTS = 8_192;
export const U7_MAX_DOCUMENT_SECTIONS = 64;
export const U7_MAX_MARKERS = 8_256;

/** E1 byte ceiling the hash work counter inherits. */
export const U7_MAX_ARTIFACT_BYTES = 4_194_304;

/** U0 overlay breakpoint: below this width the workflow renders as a sheet. */
export const U7_COMPACT_BREAKPOINT_CSS_PX = 640;

/** A0 dialog vocabulary this packet extends additively (append-only). */
export const U7_EXISTING_APPLICATION_DIALOG_KINDS = Object.freeze([
  "new-document",
  "lesson-load",
  "import-confirm",
  "discard-changes",
  "history-limit",
  "error-details",
] as const);

/**
 * The proposed seventh application dialog kind. Appended after every accepted
 * kind so accepted indices stay stable (the split-measure amendment idiom).
 * Live `APPLICATION_DIALOG_KINDS` does not contain it until a separately
 * reviewed production amendment adopts it.
 */
export const U7_MIDI_EXPORT_DIALOG_KIND = "midi-export";
export const U7_APPLICATION_DIALOG_KINDS_WITH_MIDI_EXPORT = Object.freeze([
  ...U7_EXISTING_APPLICATION_DIALOG_KINDS,
  U7_MIDI_EXPORT_DIALOG_KIND,
] as const);

/* -------------------------------------------------------------------------- */
/* Refusal and outcome vocabulary                                             */
/* -------------------------------------------------------------------------- */

/**
 * Workflow call-level refusals, in precedence order. The first failing check
 * wins. Staleness is never a refusal: it is a generate/take outcome
 * (`U7_STALE_OUTCOME_CODE`), because a changed chart is a fact to disclose,
 * not a call failure.
 */
export const U7_WORKFLOW_REFUSAL_CODES = Object.freeze([
  "u7.request_invalid",
  "u7.document_unavailable",
  "u7.hash_unavailable",
  "u7.preparation_conflict",
  "u7.preparation_missing",
  "u7.delivery_cleanup_failed",
  "limit.u7_preview_work_exceeded",
] as const);
export type U7WorkflowRefusalCode =
  (typeof U7_WORKFLOW_REFUSAL_CODES)[number];

export const U7_WORKFLOW_REFUSAL_PRECEDENCE = U7_WORKFLOW_REFUSAL_CODES;

/** Outcome code carried by stale generate/take results. Never a refusal. */
export const U7_STALE_OUTCOME_CODE = "u7.revision_stale";

/**
 * Preview blocker kinds. A blocked preview is a value, not a refusal: the
 * dialog stays open, names every blocker, and links each event-level blocker
 * into the chart. The `code` carried by a blocker is always the owning
 * package's own refusal code, verbatim (T1 resolution, V0 realization, P0
 * plan, or E1 export); U7 never rewrites or wraps it.
 */
export const U7_PREVIEW_BLOCKER_KINDS = Object.freeze([
  "realization",
  "plan",
  "export",
  "empty-chart",
] as const);
export type U7PreviewBlockerKind =
  (typeof U7_PREVIEW_BLOCKER_KINDS)[number];

/** The P0 refusal code an unbound custom chord surfaces through. */
export const U7_CUSTOM_CHORD_PLAN_CODE = "playback.custom_voicing_missing";

/* -------------------------------------------------------------------------- */
/* Derivation laws                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Marker derivation (U7-owned; E1 never derives text). Source order, one
 * `section` marker for each section's first event, one `chord` marker per
 * event. Chord marker text is the T0 canonical formatting with the unicode
 * accidental style (`formatChordSymbol(chord, "unicode")`); a custom chord's
 * marker text is its stored label. A marker whose text is empty after
 * trimming, contains an ASCII control character, or exceeds the E1 text byte
 * limit is OMITTED and disclosed — never truncated (a truncated chord symbol
 * is a musical lie) and never blocking (E1's `annotation-text` loss then
 * names the event, and the preview mirrors it).
 *
 * Overflow is unreachable by construction: chord markers are bounded by
 * `U7_MAX_DOCUMENT_CHORD_EVENTS` and section markers by
 * `U7_MAX_DOCUMENT_SECTIONS`, and their sum equals `U7_MAX_MARKERS` exactly.
 */
export const U7_MARKER_ACCIDENTAL_STYLE = "unicode";
export const U7_MARKER_OMISSION_REASONS = Object.freeze([
  "text-control-chars",
  "text-over-limit",
  "text-empty",
  "format-refused",
] as const);
export type U7MarkerOmissionReason =
  (typeof U7_MARKER_OMISSION_REASONS)[number];

/**
 * Title derivation. The validated document title is never blank (the domain
 * decoder refuses blank titles), but it may carry ASCII control characters or
 * exceed the E1 text byte limit. U7 never repairs user text: a title with a
 * control character is replaced by the pinned fallback with a notice, and an
 * over-limit title is truncated at a code-point boundary to fit the byte cap
 * with a notice (the title is track-name metadata, never musical data).
 */
export const U7_TITLE_FALLBACK = "Untitled";
export const U7_TITLE_NOTICE_KINDS = Object.freeze([
  "title-control-chars-substituted",
  "title-truncated",
] as const);
export type U7TitleNoticeKind = (typeof U7_TITLE_NOTICE_KINDS)[number];

/** Pinned track-metadata literals. */
export const U7_VOICING_TRACK_NAME = "Voicings";
export const U7_INSTRUMENT_NAME = "Changes";

/**
 * Request-id law: deterministic, E1-alphabet transliteration of the document
 * id plus the pinned revision; never a clock, random value, or file name.
 */
export const U7_REQUEST_ID_PREFIX = "u7-midi-export-";
export const U7_REQUEST_ID_MAX_ASCII_LENGTH = 128;

/**
 * The artifact hash: SHA-256 over the exact SMF bytes, lowercase hex. This is
 * a raw-bytes digest, not E0's semantic document hash; the precedent is A1's
 * `RecoveryExportBinding.artifactSha256`. Hashing happens through an injected
 * port; a port failure refuses the preview with `u7.hash_unavailable`.
 */
export const U7_ARTIFACT_SHA256_PATTERN_SOURCE = "^[0-9a-f]{64}$";

/* -------------------------------------------------------------------------- */
/* Preview model                                                              */
/* -------------------------------------------------------------------------- */

/** The binding pinned at open and re-checked at generate and at take. */
export type U7MidiExportPreviewBinding = Readonly<{
  documentId: DocumentId;
  revision: AppRevision;
}>;

/** One event-level or chart-level fact that blocks export, with its link. */
export type U7MidiExportBlocker = Readonly<{
  kind: U7PreviewBlockerKind;
  /** The owning package's refusal code, verbatim. Null only for empty-chart. */
  code: string | null;
  /** The event to focus when the user activates the blocker link. */
  eventId: ChordEventId | null;
  /** One sentence a musician can act on. Never a contract sentence. */
  message: string;
}>;

/** A marker the derivation omitted, disclosed with its reason. */
export type U7MidiExportMarkerOmission = Readonly<{
  eventId: ChordEventId;
  markerKind: "section" | "chord";
  reason: U7MarkerOmissionReason;
  utf8ByteLength: number;
}>;

export type U7MidiExportTitleNotice = Readonly<{
  kind: U7TitleNoticeKind;
  /** Original UTF-8 byte length when truncated; null otherwise. */
  originalUtf8ByteLength: number | null;
}>;

/** Provenance summary of how the plan's voicings were realized. */
export type U7MidiExportRealizationSummary = Readonly<{
  storedManualCount: number;
  storedFrozenCount: number;
  generatedCount: number;
  /** Events whose bass is external by policy: the file carries no bass note. */
  externalBassEventIds: readonly ChordEventId[];
}>;

/** One expected loss row mirrored from the E1 report. */
export type U7MidiExportLossExpectation = Readonly<{
  kind: MidiExportLossKind;
  eventIds: readonly ChordEventId[];
}>;

/** Exact tempo disclosure mirrored from the E1 report. */
export type U7MidiExportTempoDisclosure = Readonly<{
  requestedBpm: number;
  encodedMicrosecondsPerQuarter: number;
  roundingErrorNumerator: number;
  roundingErrorDenominator: number;
}>;

/**
 * The complete preview the dialog renders. Every field is derived from the
 * pinned binding; nothing is read live at render time. When `readiness` is
 * `blocked`, `artifact` is null and `blockers` is non-empty.
 */
export type U7MidiExportPreview = Readonly<{
  schema: typeof U7_MIDI_EXPORT_WORKFLOW_CONTRACT_SCHEMA;
  binding: U7MidiExportPreviewBinding;
  readiness: "ready" | "blocked";
  blockers: readonly U7MidiExportBlocker[];
  realization: U7MidiExportRealizationSummary;
  ppq: typeof U7_MIDI_PPQ;
  trackCount: typeof U7_MIDI_TRACK_COUNT;
  tempoBpm: number;
  meter: Readonly<{ beatsPerBar: number; beatUnit: number }>;
  losses: readonly U7MidiExportLossExpectation[];
  markerOmissions: readonly U7MidiExportMarkerOmission[];
  titleNotice: U7MidiExportTitleNotice | null;
  artifact: Readonly<{
    filename: string;
    byteLength: number;
    sha256: string;
    tempo: U7MidiExportTempoDisclosure;
    noteCount: number;
    markerCount: number;
  }> | null;
}>;

/* -------------------------------------------------------------------------- */
/* Dialog state machine                                                       */
/* -------------------------------------------------------------------------- */

/**
 * User-facing workflow states. `generating` models the synchronous
 * verify-and-adopt transition so the UI has an honest busy surface; no state
 * ever implies background work.
 */
export const U7_WORKFLOW_STATES = Object.freeze([
  "idle",
  "preview-open",
  "generating",
  "ready",
  "delivering",
  "delivered",
] as const);
export type U7WorkflowState = (typeof U7_WORKFLOW_STATES)[number];

/**
 * The capacity-one preparation registry mirrors the accepted E0 v1 canonical
 * registry state vocabulary. U7 restates it structurally and the static test
 * pins structural equality; accepted E0 v1 is not amended.
 */
export const U7_PREPARATION_REGISTRY_STATES = Object.freeze([
  "empty",
  "preparing",
  "ready",
  "delivering",
] as const);
export type U7PreparationRegistryState =
  (typeof U7_PREPARATION_REGISTRY_STATES)[number];

/** User/system actions that drive the workflow. */
export const U7_WORKFLOW_ACTIONS = Object.freeze([
  "open",
  "close",
  "cancel",
  "generate",
  "download",
  "re-preview",
  "dismiss-delivered",
] as const);
export type U7WorkflowAction = (typeof U7_WORKFLOW_ACTIONS)[number];

/**
 * Cancellation and closure are available from every non-delivering,
 * non-delivered open state. While `delivering`, no cancel affordance exists
 * (the browser activation is already committed); from `delivered`, the only
 * exits are `dismiss-delivered` and `re-preview`.
 */
export const U7_CANCELABLE_STATES = Object.freeze([
  "preview-open",
  "generating",
  "ready",
] as const);
export type U7CancelableState = (typeof U7_CANCELABLE_STATES)[number];

/**
 * Delivery outcomes (E0 idiom: outcomes, not refusals). `handed-off` is the
 * only success outcome in v1: the channel is object-url-download, browser
 * activation is observable, and final disk persistence is not — the dialog
 * never claims a completed save. `failed` covers a throwing activation start
 * with zero-created-resource cleanup. Cleanup failure is the single ok:false
 * delivery result and carries `u7.delivery_cleanup_failed`.
 */
export const U7_DELIVERY_OUTCOMES = Object.freeze([
  "handed-off",
  "failed",
  "cleanup-failed",
] as const);
export type U7DeliveryOutcome = (typeof U7_DELIVERY_OUTCOMES)[number];

export const U7_DELIVERY_CHANNEL = "object-url-download";
export const U7_DELIVERY_BINDING_KIND = "standard-midi-file";

/** The U7 delivery artifact binding (parallel to E0's, U7-owned). */
export type U7MidiExportDeliveryBinding = Readonly<{
  kind: typeof U7_DELIVERY_BINDING_KIND;
  sourceDocumentId: DocumentId;
  sourceRevision: AppRevision;
  filename: string;
  byteLength: number;
  artifactSha256: string;
}>;

/** Registry preparation identity: branded, monotonic, per-session. */
export declare const u7PreparationIdBrand: unique symbol;
export type U7MidiExportPreparationId = number & {
  readonly [u7PreparationIdBrand]: "U7MidiExportPreparationId";
};
export const MIN_U7_PREPARATION_ID = 1;
export const MAX_U7_PREPARATION_ID = 9_007_199_254_740_991;

/* -------------------------------------------------------------------------- */
/* Accessibility matrix vocabulary                                            */
/* -------------------------------------------------------------------------- */

/** Overlay surfaces: modal dialog at/above the U0 compact breakpoint, sheet below. */
export const U7_WORKFLOW_SURFACES = Object.freeze(["dialog", "sheet"] as const);
export type U7WorkflowSurface = (typeof U7_WORKFLOW_SURFACES)[number];

/**
 * Live-region announcement keys. The rendered copy is a UI concern; the keys
 * are the frozen contract so every state transition has a pinned announcement.
 */
export const U7_ANNOUNCEMENT_KEYS = Object.freeze([
  "u7.announce.preview_ready",
  "u7.announce.preview_blocked",
  "u7.announce.generating",
  "u7.announce.ready",
  "u7.announce.stale",
  "u7.announce.delivering",
  "u7.announce.handed_off",
  "u7.announce.delivery_failed",
  "u7.announce.cleanup_failed",
  "u7.announce.cancelled",
  "u7.announce.closed",
] as const);
export type U7AnnouncementKey = (typeof U7_ANNOUNCEMENT_KEYS)[number];

/** Live-region politeness per announcement kind. */
export const U7_ANNOUNCEMENT_POLITENESS = Object.freeze({
  status: "polite",
  refusal: "assertive",
} as const);

/* -------------------------------------------------------------------------- */
/* Limits and work counters                                                   */
/* -------------------------------------------------------------------------- */

export const U7_WORKFLOW_LIMITS = Object.freeze({
  maxChordEvents: U7_MAX_DOCUMENT_CHORD_EVENTS,
  maxSections: U7_MAX_DOCUMENT_SECTIONS,
  maxMarkers: U7_MAX_MARKERS,
  maxMarkerTextUtf8Bytes: U7_MAX_MARKER_TEXT_UTF8_BYTES,
  maxArtifactBytes: U7_MAX_ARTIFACT_BYTES,
  maxFilenameCharacters: U7_FILENAME_MAX_CHARACTERS,
  maxRequestIdAsciiLength: U7_REQUEST_ID_MAX_ASCII_LENGTH,
  minPreparationId: MIN_U7_PREPARATION_ID,
  maxPreparationId: MAX_U7_PREPARATION_ID,
  compactBreakpointCssPx: U7_COMPACT_BREAKPOINT_CSS_PX,
} as const);

/**
 * Preview assembly work counters. Every counter is a deterministic bound
 * inherited from an upstream cap; exceeding one refuses
 * `limit.u7_preview_work_exceeded`, a failsafe that is unreachable while the
 * domain caps hold. Wall time is never a bound.
 */
export const U7_PREVIEW_WORK_COUNTER_NAMES = Object.freeze([
  "events-visited",
  "markers-derived",
  "bytes-hashed",
] as const);
export type U7PreviewWorkCounterName =
  (typeof U7_PREVIEW_WORK_COUNTER_NAMES)[number];

export const U7_PREVIEW_WORK_COUNTER_MAXIMA = Object.freeze({
  "events-visited": U7_MAX_DOCUMENT_CHORD_EVENTS,
  "markers-derived": U7_MAX_MARKERS,
  "bytes-hashed": U7_MAX_ARTIFACT_BYTES,
} as const);

/* -------------------------------------------------------------------------- */
/* Component inventory                                                        */
/* -------------------------------------------------------------------------- */

export const U7_COMPONENT_INVENTORY = Object.freeze([
  { id: "U7-CMP-001", name: "MidiExportTrigger", surface: "header" },
  { id: "U7-CMP-002", name: "MidiExportDialog", surface: "dialog" },
  { id: "U7-CMP-003", name: "MidiExportSheet", surface: "sheet" },
  { id: "U7-CMP-004", name: "MidiExportReadinessSummary", surface: "shared" },
  { id: "U7-CMP-005", name: "MidiExportDisclosureList", surface: "shared" },
  { id: "U7-CMP-006", name: "MidiExportBlockedList", surface: "shared" },
  { id: "U7-CMP-007", name: "MidiExportBlockedEventLink", surface: "shared" },
  { id: "U7-CMP-008", name: "MidiExportArtifactSummary", surface: "shared" },
  { id: "U7-CMP-009", name: "MidiExportGenerateButton", surface: "shared" },
  { id: "U7-CMP-010", name: "MidiExportDownloadButton", surface: "shared" },
  { id: "U7-CMP-011", name: "MidiExportCancelButton", surface: "shared" },
  { id: "U7-CMP-012", name: "MidiExportStatusRegion", surface: "shared" },
] as const);
export type U7ComponentInventoryEntry =
  (typeof U7_COMPONENT_INVENTORY)[number];
export const U7_COMPONENT_COUNT = U7_COMPONENT_INVENTORY.length;

/* -------------------------------------------------------------------------- */
/* Channel discipline                                                         */
/* -------------------------------------------------------------------------- */

/**
 * U7 adds no mutation channel. The workflow reads the current validated
 * document and never writes one: it dispatches zero A0 command kinds. Its
 * only ephemeral-intent needs are opening and closing its own dialog.
 */
export const U7_AUTHORIZED_COMMAND_KINDS = Object.freeze([] as const);
export const U7_AUTHORIZED_EPHEMERAL_INTENT_KINDS = Object.freeze([
  "push-dialog",
  "pop-dialog",
] as const);

/**
 * Hard non-claims, pinned so a future implementation cannot smuggle them in:
 * MIDI export never advances the canonical export marker (the artifact is a
 * lossy performance file, not the document interchange form), never calls
 * recovery Save, never auto-fixes a voicing, never downloads stale bytes, and
 * never requires a pointer. Blocked-event links reuse the existing chart
 * selection surface; they add no channel.
 */
export const U7_FORBIDDEN_EPHEMERAL_INTENT_KINDS = Object.freeze([
  "mark-exported",
  "set-recovery",
] as const);

/** The E1 refusal codes a blocked preview can carry, verbatim. */
export type U7CarriedExportRefusalCode = MidiExportRefusalCode;

/* -------------------------------------------------------------------------- */
/* Laws                                                                       */
/* -------------------------------------------------------------------------- */

export const U7_LAW_IDS = Object.freeze([
  "U7-LAW-PREVIEW-BINDING",
  "U7-LAW-DERIVATION-MARKER",
  "U7-LAW-DERIVATION-TITLE",
  "U7-LAW-DERIVATION-REQUEST-ID",
  "U7-LAW-REALIZATION-SUMMARY",
  "U7-LAW-BLOCKED-ENUMERATION",
  "U7-LAW-LOSS-MIRROR",
  "U7-LAW-ARTIFACT-HASH",
  "U7-LAW-DETERMINISTIC-BYTES",
  "U7-LAW-STATE-MACHINE",
  "U7-LAW-REGISTRY-DISCIPLINE",
  "U7-LAW-DELIVERY-CLEANUP",
  "U7-LAW-NO-EXPORT-MARKER",
  "U7-LAW-NO-RECOVERY-SAVE",
  "U7-LAW-NO-VOICING-REPAIR",
  "U7-LAW-ACCESSIBILITY-MATRIX",
  "U7-LAW-WORK-BOUND",
] as const);
export type U7LawId = (typeof U7_LAW_IDS)[number];
