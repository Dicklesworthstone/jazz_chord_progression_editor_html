import type { ValidatedDocument } from "../domain";
import {
  CANONICAL_EXPORT_REVISION_PUBLICATION_SCHEMA,
  DISCARD_IMPORT_REPLACEMENT_PUBLICATION_REASONS,
  IMPORT_NONUNDOABLE_CONFIRMATION_SCHEMA,
  IMPORT_REPLACEMENT_ORIGIN_BY_SOURCE_FORMAT,
  IMPORT_SOURCE_FORMATS,
  PREPARED_IMPORT_REPLACEMENT_PUBLICATION_SCHEMA,
} from "./application-interchange-owner-contract";
// eslint-disable-next-line no-duplicate-imports -- Keep the runtime tables and the type-only surface as separately audited dependency edges.
import type {
  A0E0InterchangeOwnerOperationName,
  A0E0InterchangeOwnerOperations,
  DiscardImportReplacementPublicationOperation,
  ImportRequestIdentity,
  ImportSourceFormat,
  PrepareImportReplacementPublicationOperation,
  PrepareImportReplacementPublicationResult,
  PreparedImportReplacementPublication,
  ImportReplacementPreparationRefusalCode,
  PublishCanonicalExportRevisionOperation,
  PublishImportReplacementOperation,
  ReadCurrentApplicationDocumentIdentityOperation,
} from "./application-interchange-owner-contract";
import {
  MAX_APPLICATION_REVISION,
  MAX_APPLICATION_SEQUENCE,
  MAX_COMMAND_ID_CODE_POINTS,
  MAX_COMMAND_LABEL_CODE_POINTS,
  MAX_HISTORY_RETAINED_BYTES,
} from "./application-state-contract";
// eslint-disable-next-line no-duplicate-imports -- Same audited split: bounded-limit constants at runtime, state shapes as types.
import type {
  AppState,
  AppRevision,
  ApplicationCommandDependencies,
  ApplicationEffect,
  ApplicationWorkCounters,
  HistoryEntry,
  HistoryState,
  Notice,
  ReplaceDocumentCommand,
  StableUiBookmarks,
  TransportGeneration,
} from "./application-state-contract";
import { initialBookmarks } from "./application-bookmarks";
import { enforceHistoryCaps, isValidHistoryEstimate } from "./application-history";
import {
  buildDocumentIndex,
  createWorkCounters,
  deepStructuralEqual,
  freezeWorkCounters,
  isBoundedToken,
  isNonnegativeSafeInteger,
  isPositiveSafeInteger,
  runtimeField,
} from "./application-state-helpers";

/**
 * A0-owned production implementation of the accepted A0/E0 owner-ports bridge
 * (docs/A0_E0_OWNER_PORTS_CONTRACT.md, bead jcpe-94yu.2).
 *
 * The five operations are CONTROLLER-OWNED: `createStudioInterchangeOwnerOperations`
 * is called only from the studio-controller composition, and the access record
 * it receives closes over the controller's private current-state cell, install
 * path, and listener set. Nothing here is attached to `StudioController`,
 * exported as a singleton, or reachable from a public E0 call, and no owner
 * request or result ever carries an `AppState`.
 */

/** One structured, state-free diagnostic event; results never carry these. */
export type StudioInterchangeOwnerDiagnostic = Readonly<{
  operation: A0E0InterchangeOwnerOperationName;
  event: string;
  ordinal: number;
}>;

/**
 * Composition-private capabilities the controller closure lends the owner
 * operations. `readState` returns the latest immutable state at call time;
 * `installState` runs the controller's exact install discipline (view model,
 * state cell, document index) WITHOUT notifying; `notifyListeners` is the
 * controller's own subscriber walk, called strictly after installation.
 */
export type StudioInterchangeOwnerAccess = Readonly<{
  dependencies: ApplicationCommandDependencies;
  readState: () => AppState;
  installState: (next: AppState) => void;
  notifyListeners: () => void;
  emitDiagnostic?: (diagnostic: StudioInterchangeOwnerDiagnostic) => void;
}>;

/**
 * Everything a publication needs, frozen at preparation so publish never
 * reruns F2, F3, bookmark repair, history estimation, or impact calculation.
 * The whole prepare-time AppState is deliberately NOT here: publication merges
 * this material into the latest controller state under the frozen field
 * partition of `IMPORT_REPLACEMENT_PUBLICATION_LATEST_STATE_MERGE`.
 */
export type StudioPreparedImportReplacementMaterial = Readonly<{
  command: ReplaceDocumentCommand;
  document: ValidatedDocument;
  newRevision: AppRevision;
  historyEntry: HistoryEntry;
  history: HistoryState;
  bookmarks: StableUiBookmarks;
  quickEntry: AppState["quickEntry"];
  warningNotice: Readonly<Omit<Notice, "sequence">> | null;
  effects: readonly ApplicationEffect[];
  counters: ApplicationWorkCounters;
  pendingRequestsBefore: AppState["pendingRequests"];
  transitionBefore: AppState["documentTransition"];
  bookmarksBefore: StableUiBookmarks;
  expectedTransportGeneration: TransportGeneration;
}>;

type RegistryEntry = Readonly<{
  key: ImportRequestIdentity;
  echo: PreparedImportReplacementPublication;
  material: StudioPreparedImportReplacementMaterial;
}>;

const PREPARE_REQUEST_KEYS = Object.freeze([
  "identity",
  "sourceFormat",
  "replacementOrigin",
  "candidate",
  "replacementCommandSeed",
  "disclosedImpact",
  "currentTransition",
  "nonUndoableConfirmation",
] as const);
const IDENTITY_KEYS = Object.freeze([
  "requestId",
  "documentId",
  "baseRevision",
] as const);
const SEED_KEYS = Object.freeze(["id", "label", "logicalTimeMs"] as const);
const IMPACT_KEYS = Object.freeze([
  "historyEntryRetainedBytes",
  "evictedUndoEntries",
  "redoEntriesCleared",
  "confirmationRequired",
  "undoDisposition",
  "undoEntriesAfterCommit",
  "undoRetainedBytesAfterCommit",
  "exportRecommended",
] as const);
const TRANSITION_KEYS = Object.freeze([
  "kind",
  "requestId",
  "origin",
  "baseRevision",
  "candidateDocumentId",
  "undoDisposition",
] as const);
const ACKNOWLEDGEMENT_KEYS = Object.freeze(["kind", "requirement"] as const);
const REQUIREMENT_KEYS = Object.freeze([
  "schema",
  "confirmationId",
  "identity",
  "candidateDocumentId",
  "commandId",
  "disclosedImpact",
] as const);
const RETIREMENT_KEYS = Object.freeze([
  "requestId",
  "retiredTransportGeneration",
  "progressionRetired",
  "previewRetired",
  "noFutureAttack",
] as const);
const HANDOFF_KEYS = Object.freeze(["prepared", "retirement"] as const);
const MARKER_REQUEST_KEYS = Object.freeze(["publication"] as const);
const MARKER_PUBLICATION_KEYS = Object.freeze([
  "schema",
  "documentId",
  "revision",
] as const);

const REPLACEMENT_NOT_UNDOABLE_MESSAGE =
  "This replacement cannot be undone; export the chart to keep a portable copy.";

const EMPTY_HISTORY: HistoryState = Object.freeze({
  undo: Object.freeze([]),
  redo: Object.freeze([]),
  retainedBytesEstimate: 0,
});

function isPlainRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: unknown,
  keys: readonly string[],
): value is Readonly<Record<string, unknown>> {
  if (!isPlainRecord(value)) return false;
  const present = Object.keys(value);
  if (present.length !== keys.length) return false;
  return keys.every((key) => Object.hasOwn(value, key));
}

function isDispositionLiteral(
  value: unknown,
): value is "retained" | "explicitly-unavailable" {
  return value === "retained" || value === "explicitly-unavailable";
}

function isSourceFormatLiteral(value: unknown): value is ImportSourceFormat {
  return (IMPORT_SOURCE_FORMATS as readonly unknown[]).includes(value);
}

/**
 * Pure marker-CAS successor state: the current state with only
 * `exportRevision` replaced. Every other field keeps the exact current
 * reference, which is what the bridge contract's reference-identity
 * preservation law measures.
 */
export function createExportRevisionMarkedState(
  current: AppState,
  revision: AppRevision,
): AppState {
  return Object.freeze({ ...current, exportRevision: revision });
}

/**
 * Pure latest-state merge for a prepared replacement. Applies the frozen
 * `IMPORT_REPLACEMENT_PUBLICATION_LATEST_STATE_MERGE` partition: latest value
 * for `exportRevision`; latest references for `recovery`, `panels`, `dialogs`,
 * and `transport`; replacement-owned material for the document family; and
 * `focusRequest`/`nextSequence` allocated from the LATEST sequence, with the
 * optional warning notice saturating at `MAX_APPLICATION_SEQUENCE`.
 */
export function applyPreparedImportReplacementToLatestState(
  latest: AppState,
  material: StudioPreparedImportReplacementMaterial,
): AppState {
  const focusSequence = latest.nextSequence;
  let nextSequence = focusSequence + 1;
  let notices: readonly Notice[] = Object.freeze([]);
  if (material.warningNotice !== null) {
    const noticeSequence = Math.min(nextSequence, MAX_APPLICATION_SEQUENCE);
    notices = Object.freeze([
      Object.freeze({ ...material.warningNotice, sequence: noticeSequence }),
    ]);
    nextSequence =
      noticeSequence < MAX_APPLICATION_SEQUENCE
        ? noticeSequence + 1
        : noticeSequence;
  }
  return Object.freeze({
    document: material.document,
    revision: material.newRevision,
    exportRevision: latest.exportRevision,
    recovery: latest.recovery,
    history: material.history,
    bookmarks: material.bookmarks,
    panels: latest.panels,
    dialogs: latest.dialogs,
    quickEntry: material.quickEntry,
    importDraft: null,
    transport: latest.transport,
    pendingRequests: Object.freeze([]),
    documentTransition: Object.freeze({ kind: "idle" as const }),
    focusRequest: Object.freeze({
      sequence: focusSequence,
      target: Object.freeze({ kind: "chart" as const }),
      reason: "replacement" as const,
    }),
    notices,
    nextSequence,
  });
}

export function createStudioInterchangeOwnerOperations(
  access: StudioInterchangeOwnerAccess,
): A0E0InterchangeOwnerOperations {
  const { dependencies, readState, installState, notifyListeners } = access;
  const sink = access.emitDiagnostic;

  /** Capacity-one private registry; `null` is the `empty` observable state. */
  let liveEntry: RegistryEntry | null = null;
  let diagnosticOrdinal = 0;

  const emit = (
    operation: A0E0InterchangeOwnerOperationName,
    event: string,
  ): void => {
    if (sink === undefined) return;
    diagnosticOrdinal += 1;
    try {
      sink(Object.freeze({ operation, event, ordinal: diagnosticOrdinal }));
    } catch {
      // A diagnostics sink cannot make an owner operation fail or throw.
    }
  };

  const prepare: PrepareImportReplacementPublicationOperation = (request) => {
    emit("prepareImportReplacementPublication", "call.prepare");
    const state = readState();
    emit("prepareImportReplacementPublication", "read.controller-state");

    const refuse = (
      code: ImportReplacementPreparationRefusalCode,
    ): PrepareImportReplacementPublicationResult => {
      emit("prepareImportReplacementPublication", `refuse.${code}`);
      emit(
        "prepareImportReplacementPublication",
        "return.refused-no-allocation",
      );
      return Object.freeze({ ok: false, code });
    };

    /* 1. Recursively exact owner-envelope keys and the source/origin law. */
    emit("prepareImportReplacementPublication", "validate.request-envelope");
    const raw: unknown = request;
    if (!hasExactKeys(raw, PREPARE_REQUEST_KEYS)) {
      return refuse("import.replacement_request_invalid");
    }
    const rawIdentity = raw["identity"];
    if (!hasExactKeys(rawIdentity, IDENTITY_KEYS)) {
      return refuse("import.replacement_request_invalid");
    }
    const requestId = rawIdentity["requestId"];
    const requestDocumentId = rawIdentity["documentId"];
    const baseRevision = rawIdentity["baseRevision"];
    if (
      typeof requestId !== "number" ||
      !isPositiveSafeInteger(requestId) ||
      typeof requestDocumentId !== "string" ||
      requestDocumentId.length === 0 ||
      typeof baseRevision !== "number" ||
      !isNonnegativeSafeInteger(baseRevision)
    ) {
      return refuse("import.replacement_request_invalid");
    }
    const sourceFormat = raw["sourceFormat"];
    if (
      !isSourceFormatLiteral(sourceFormat) ||
      raw["replacementOrigin"] !==
        IMPORT_REPLACEMENT_ORIGIN_BY_SOURCE_FORMAT[sourceFormat]
    ) {
      return refuse("import.replacement_request_invalid");
    }
    const origin = IMPORT_REPLACEMENT_ORIGIN_BY_SOURCE_FORMAT[sourceFormat];
    const rawCandidate = raw["candidate"];
    if (!isPlainRecord(rawCandidate)) {
      return refuse("import.replacement_request_invalid");
    }
    const rawSeed = raw["replacementCommandSeed"];
    if (!hasExactKeys(rawSeed, SEED_KEYS)) {
      return refuse("import.replacement_request_invalid");
    }
    const seedId = rawSeed["id"];
    const seedLabel = rawSeed["label"];
    const seedLogicalTimeMs = rawSeed["logicalTimeMs"];
    if (
      typeof seedId !== "string" ||
      typeof seedLabel !== "string" ||
      typeof seedLogicalTimeMs !== "number"
    ) {
      return refuse("import.replacement_request_invalid");
    }
    const rawImpact = raw["disclosedImpact"];
    if (!hasExactKeys(rawImpact, IMPACT_KEYS)) {
      return refuse("import.replacement_request_invalid");
    }
    const disclosedDisposition = rawImpact["undoDisposition"];
    if (
      !isDispositionLiteral(disclosedDisposition) ||
      rawImpact["confirmationRequired"] !== true ||
      [
        rawImpact["historyEntryRetainedBytes"],
        rawImpact["evictedUndoEntries"],
        rawImpact["redoEntriesCleared"],
        rawImpact["undoEntriesAfterCommit"],
        rawImpact["undoRetainedBytesAfterCommit"],
      ].some(
        (value) =>
          typeof value !== "number" || !isNonnegativeSafeInteger(value),
      ) ||
      (disclosedDisposition === "retained"
        ? rawImpact["exportRecommended"] !== false
        : rawImpact["exportRecommended"] !== true ||
          rawImpact["undoEntriesAfterCommit"] !== 0 ||
          rawImpact["undoRetainedBytesAfterCommit"] !== 0)
    ) {
      return refuse("import.replacement_request_invalid");
    }
    const rawTransition = raw["currentTransition"];
    if (
      !hasExactKeys(rawTransition, TRANSITION_KEYS) ||
      typeof rawTransition["kind"] !== "string" ||
      typeof rawTransition["requestId"] !== "number" ||
      typeof rawTransition["origin"] !== "string" ||
      typeof rawTransition["baseRevision"] !== "number" ||
      typeof rawTransition["candidateDocumentId"] !== "string" ||
      !isDispositionLiteral(rawTransition["undoDisposition"])
    ) {
      return refuse("import.replacement_request_invalid");
    }
    const rawConfirmation = raw["nonUndoableConfirmation"];
    if (rawConfirmation !== null && !isPlainRecord(rawConfirmation)) {
      return refuse("import.replacement_request_invalid");
    }
    /*
     * jcpe-94yu.3: recursively exact keys are a STEP-1 envelope law at every
     * owner-defined request boundary, including a present confirmation
     * acknowledgement. A smuggled key anywhere in the acknowledgement,
     * requirement, requirement identity, or disclosed impact is a malformed
     * present confirmation and refuses `import.confirmation_identity_mismatch`
     * BEFORE any identity comparison or candidate work (BRIDGE-REP-023
     * extra-key family). Value-level confirmation semantics stay in step 10.
     */
    if (rawConfirmation !== null) {
      const structurallyExact =
        hasExactKeys(rawConfirmation, ACKNOWLEDGEMENT_KEYS) &&
        hasExactKeys(rawConfirmation["requirement"], REQUIREMENT_KEYS) &&
        hasExactKeys(
          runtimeField(rawConfirmation["requirement"], "identity"),
          IDENTITY_KEYS,
        ) &&
        hasExactKeys(
          runtimeField(rawConfirmation["requirement"], "disclosedImpact"),
          IMPACT_KEYS,
        );
      if (!structurallyExact) {
        return refuse("import.confirmation_identity_mismatch");
      }
    }

    /* 2. Complete identity against controller-owned current state. */
    emit("prepareImportReplacementPublication", "compare.complete-identity");
    if (requestDocumentId !== state.document.id) {
      return refuse("import.replacement_wrong_document");
    }
    if (baseRevision !== state.revision) {
      return refuse("import.replacement_request_stale");
    }
    const pendingTransitionRequest = state.pendingRequests.find(
      (pending) =>
        pending.kind === "document-transition" &&
        pending.id === requestId &&
        pending.documentId === state.document.id &&
        pending.baseRevision === state.revision,
    );
    if (pendingTransitionRequest === undefined) {
      return refuse("import.replacement_request_stale");
    }

    /* Transition binding, including the candidate document ID. */
    emit("prepareImportReplacementPublication", "compare.transition-binding");
    const transition = state.documentTransition;
    const candidateDocumentId = runtimeField(rawCandidate, "id");
    if (
      transition.kind !== "retiring-transport" ||
      transition.requestId !== requestId ||
      transition.baseRevision !== baseRevision ||
      transition.origin !== origin ||
      transition.candidateDocumentId !== candidateDocumentId ||
      rawTransition["kind"] !== transition.kind ||
      rawTransition["requestId"] !== transition.requestId ||
      rawTransition["origin"] !== transition.origin ||
      rawTransition["baseRevision"] !== transition.baseRevision ||
      rawTransition["candidateDocumentId"] !== transition.candidateDocumentId
    ) {
      return refuse("import.replacement_transition_mismatch");
    }
    if (
      rawTransition["undoDisposition"] !== transition.undoDisposition ||
      disclosedDisposition !== transition.undoDisposition
    ) {
      // The disposition axis is an impact disagreement, not a location one.
      return refuse("import.replacement_impact_mismatch");
    }

    /* 3. Command metadata under A0's bounded-token and logical-time laws. */
    emit("prepareImportReplacementPublication", "validate.command-metadata");
    if (!isBoundedToken(seedId, MAX_COMMAND_ID_CODE_POINTS)) {
      return refuse("import.replacement_command_id_invalid");
    }
    if (!isBoundedToken(seedLabel, MAX_COMMAND_LABEL_CODE_POINTS)) {
      return refuse("import.replacement_command_label_invalid");
    }
    const latestUndoEntry = state.history.undo[state.history.undo.length - 1];
    if (
      !isNonnegativeSafeInteger(seedLogicalTimeMs) ||
      (latestUndoEntry !== undefined &&
        seedLogicalTimeMs < latestUndoEntry.lastLogicalTimeMs)
    ) {
      return refuse("import.replacement_logical_time_invalid");
    }

    /* 4. Revision and application-sequence increments must be available. */
    emit(
      "prepareImportReplacementPublication",
      "check.revision-and-sequence-capacity",
    );
    if (state.revision >= MAX_APPLICATION_REVISION) {
      return refuse("application.revision_exhausted");
    }
    if (state.nextSequence >= MAX_APPLICATION_SEQUENCE) {
      return refuse("application.sequence_exhausted");
    }

    /* 5-6. Complete F2 structural decode and F3 semantic publication. */
    const counters = createWorkCounters();
    buildDocumentIndex(state.document, counters);
    emit("prepareImportReplacementPublication", "call.f2");
    const decoded = dependencies.decodeDocumentShape(rawCandidate);
    if (!decoded.ok) {
      return refuse("import.candidate_structural_invalid");
    }
    emit("prepareImportReplacementPublication", "call.f3");
    counters.validationCalls += 1;
    const validated = dependencies.validateDocumentSemantics(decoded.value);
    if (!validated.ok) {
      return refuse("import.candidate_semantic_invalid");
    }

    /* 7. Replacement bookmark/focus material (A0's replacement reset law). */
    emit(
      "prepareImportReplacementPublication",
      "repair.bookmarks-and-focus",
    );
    const afterBookmarks = initialBookmarks(validated.value, counters);

    /* 8. The real A0 retained-history byte estimator and cap policy. */
    emit("prepareImportReplacementPublication", "estimate.history");
    const entryWithoutEstimate: Omit<HistoryEntry, "retainedBytesEstimate"> = {
      commandId: seedId,
      commandKind: "replace-document",
      label: seedLabel,
      before: state.document,
      after: validated.value,
      beforeBookmarks: state.bookmarks,
      afterBookmarks,
      coalescing: null,
      firstLogicalTimeMs: seedLogicalTimeMs,
      lastLogicalTimeMs: seedLogicalTimeMs,
    };
    const retainedBytesEstimate =
      dependencies.estimateHistoryRetainedBytes(entryWithoutEstimate);
    if (!isValidHistoryEstimate(retainedBytesEstimate)) {
      return refuse("import.replacement_history_estimate_failed");
    }
    counters.historyBytesEstimated += retainedBytesEstimate;
    const historyEntry: HistoryEntry = Object.freeze({
      ...entryWithoutEstimate,
      retainedBytesEstimate,
    });
    const oversized = retainedBytesEstimate > MAX_HISTORY_RETAINED_BYTES;
    if (disclosedDisposition === "retained" && oversized) {
      // The disclosed retained impact does not exist for this replacement.
      return refuse("import.replacement_impact_unavailable");
    }
    let retainedHistory: HistoryState | null = null;
    if (!oversized) {
      retainedHistory = enforceHistoryCaps([...state.history.undo, historyEntry]);
      if (retainedHistory === null) {
        return refuse("import.replacement_history_estimate_failed");
      }
    }

    /* 9. Recompute the current replacement impact and compare exactly. */
    emit("prepareImportReplacementPublication", "recompute.impact");
    const recomputedImpact = oversized
      ? Object.freeze({
          historyEntryRetainedBytes: retainedBytesEstimate,
          evictedUndoEntries: state.history.undo.length,
          redoEntriesCleared: state.history.redo.length,
          confirmationRequired: true as const,
          undoDisposition: "explicitly-unavailable" as const,
          undoEntriesAfterCommit: 0 as const,
          undoRetainedBytesAfterCommit: 0 as const,
          exportRecommended: true as const,
        })
      : Object.freeze({
          historyEntryRetainedBytes: retainedBytesEstimate,
          evictedUndoEntries:
            state.history.undo.length +
            1 -
            (retainedHistory?.undo.length ?? 0),
          redoEntriesCleared: state.history.redo.length,
          confirmationRequired: true as const,
          undoDisposition: "retained" as const,
          undoEntriesAfterCommit: retainedHistory?.undo.length ?? 0,
          undoRetainedBytesAfterCommit:
            retainedHistory?.retainedBytesEstimate ?? 0,
          exportRecommended: false as const,
        });
    if (!deepStructuralEqual(rawImpact, recomputedImpact)) {
      return refuse("import.replacement_impact_mismatch");
    }

    /* 10. Confirmation disposition and internal consistency. */
    emit("prepareImportReplacementPublication", "compare.confirmation");
    let confirmationId: string | null = null;
    if (disclosedDisposition === "retained") {
      if (rawConfirmation !== null) {
        return refuse("import.confirmation_identity_mismatch");
      }
    } else {
      if (rawConfirmation === null) {
        return refuse("history.nonundoable_confirmation_required");
      }
      if (
        !hasExactKeys(rawConfirmation, ACKNOWLEDGEMENT_KEYS) ||
        rawConfirmation["kind"] !== "acknowledged"
      ) {
        return refuse("import.confirmation_identity_mismatch");
      }
      const requirement = rawConfirmation["requirement"];
      if (
        !hasExactKeys(requirement, REQUIREMENT_KEYS) ||
        !hasExactKeys(requirement["identity"], IDENTITY_KEYS) ||
        !hasExactKeys(requirement["disclosedImpact"], IMPACT_KEYS) ||
        requirement["schema"] !== IMPORT_NONUNDOABLE_CONFIRMATION_SCHEMA
      ) {
        return refuse("import.confirmation_identity_mismatch");
      }
      const requirementConfirmationId = requirement["confirmationId"];
      if (
        typeof requirementConfirmationId !== "string" ||
        !isBoundedToken(requirementConfirmationId, MAX_COMMAND_ID_CODE_POINTS)
      ) {
        return refuse("import.confirmation_identity_mismatch");
      }
      const requirementIdentity = requirement["identity"];
      if (
        !isPlainRecord(requirementIdentity) ||
        requirementIdentity["documentId"] !== requestDocumentId
      ) {
        return refuse("import.confirmation_wrong_document");
      }
      if (
        requirementIdentity["baseRevision"] !== baseRevision ||
        requirementIdentity["requestId"] !== requestId
      ) {
        return refuse("import.confirmation_stale");
      }
      if (
        requirement["candidateDocumentId"] !== candidateDocumentId ||
        requirement["commandId"] !== seedId
      ) {
        return refuse("import.confirmation_identity_mismatch");
      }
      if (!deepStructuralEqual(requirement["disclosedImpact"], rawImpact)) {
        return refuse("import.confirmation_impact_mismatch");
      }
      confirmationId = requirementConfirmationId;
    }

    /* 11. The private registry must be empty; capacity is one, globally. */
    emit(
      "prepareImportReplacementPublication",
      "inspect.registry-capacity-one",
    );
    if (liveEntry !== null) {
      /*
       * jcpe-94yu.3: the pinned busy event order is exactly
       * `observe.registry-busy` then `return.refused` — the observation event
       * already records the refusal fact, so no separate `refuse.*` event is
       * emitted on this branch (BRIDGE-REP-024/capacity-one-busy).
       */
      emit("prepareImportReplacementPublication", "observe.registry-busy");
      emit("prepareImportReplacementPublication", "return.refused");
      return Object.freeze({
        ok: false,
        code: "import.replacement_preparation_busy",
      });
    }

    /* 12. Allocate exactly one complete private preparation. */
    emit("prepareImportReplacementPublication", "allocate.registry-entry");
    const newRevision = state.revision + 1;
    const identity: ImportRequestIdentity = Object.freeze({
      requestId,
      documentId: state.document.id,
      baseRevision,
    });
    const command: ReplaceDocumentCommand = Object.freeze({
      id: seedId,
      label: seedLabel,
      expectedDocumentId: state.document.id,
      expectedRevision: state.revision,
      logicalTimeMs: seedLogicalTimeMs,
      coalescing: null,
      kind: "replace-document",
      origin,
      candidate: validated.value,
      requestId,
      retirement: Object.freeze({
        requestId,
        retiredTransportGeneration: state.transport.generation,
        progressionRetired: true,
        previewRetired: true,
        noFutureAttack: true,
      }),
      undoDisposition:
        confirmationId === null
          ? Object.freeze({ kind: "retain" as const })
          : Object.freeze({
              kind: "explicitly-unavailable" as const,
              confirmationId,
              exportRecommended: true as const,
            }),
    });
    const effects: ApplicationEffect[] = [
      Object.freeze({
        kind: "queue-recovery" as const,
        revision: newRevision,
        requestId: null,
        reasonCode: "command:replace-document",
      }),
      Object.freeze({
        kind: "compile-playback-plan" as const,
        revision: newRevision,
        requestId: null,
        reasonCode: "command:replace-document",
      }),
      Object.freeze({
        kind: "restore-focus" as const,
        revision: newRevision,
        requestId: null,
        reasonCode: "command:replace-document",
      }),
      Object.freeze({
        kind: "announce" as const,
        revision: newRevision,
        requestId: null,
        reasonCode: "command:replace-document",
      }),
    ];
    if (oversized) {
      effects.push(
        Object.freeze({
          kind: "recommend-export" as const,
          revision: newRevision,
          requestId,
          reasonCode: "history.replacement_not_undoable",
        }),
      );
    }
    const material: StudioPreparedImportReplacementMaterial = Object.freeze({
      command,
      document: validated.value,
      newRevision,
      historyEntry,
      history: retainedHistory ?? EMPTY_HISTORY,
      bookmarks: afterBookmarks,
      quickEntry: Object.freeze({
        text: "",
        target: afterBookmarks.insertion,
        baseRevision: newRevision,
        status: "idle" as const,
        issueCodes: Object.freeze([]),
      }),
      warningNotice: oversized
        ? Object.freeze({
            level: "warning" as const,
            code: "history.replacement_not_undoable",
            message: REPLACEMENT_NOT_UNDOABLE_MESSAGE,
            createdAtRevision: newRevision,
            dismissible: true,
          })
        : null,
      effects: Object.freeze(effects),
      counters: freezeWorkCounters(counters),
      pendingRequestsBefore: state.pendingRequests,
      transitionBefore: state.documentTransition,
      bookmarksBefore: state.bookmarks,
      expectedTransportGeneration: state.transport.generation,
    });
    const echo: PreparedImportReplacementPublication = Object.freeze({
      schema: PREPARED_IMPORT_REPLACEMENT_PUBLICATION_SCHEMA,
      identity,
      sourceFormat,
      candidateDocumentId: validated.value.id,
      expectedTransportGeneration: state.transport.generation,
      committingTransition: Object.freeze({
        kind: "committing" as const,
        requestId,
        origin,
        baseRevision,
        candidateDocumentId: validated.value.id,
        undoDisposition: disclosedDisposition,
      }),
    });
    liveEntry = Object.freeze({ key: identity, echo, material });
    emit("prepareImportReplacementPublication", "return.prepared");
    return Object.freeze({ ok: true, value: echo });
  };

  const discard: DiscardImportReplacementPublicationOperation = (request) => {
    emit("discardImportReplacementPublication", "call.discard");
    const raw: unknown = request;
    const rawIdentity = runtimeField(raw, "identity");
    const reason = runtimeField(raw, "reason");
    emit("discardImportReplacementPublication", "validate.reason");
    if (
      !(DISCARD_IMPORT_REPLACEMENT_PUBLICATION_REASONS as readonly unknown[])
        .includes(reason)
    ) {
      emit("discardImportReplacementPublication", "observe.unknown-reason");
    }
    const requestId = runtimeField(rawIdentity, "requestId");
    const documentId = runtimeField(rawIdentity, "documentId");
    const baseRevision = runtimeField(rawIdentity, "baseRevision");
    const entry = liveEntry;
    /*
     * jcpe-94yu.3: on the wrong-identity branch the pinned return event is
     * `return.live-zero-for-request` — the count is zero FOR THE REQUEST while
     * an unrelated live entry survives (BRIDGE-REP-028). The matching and
     * empty branches return the plain `return.live-zero`.
     */
    let unrelatedEntryPreserved = false;
    if (entry === null) {
      emit("discardImportReplacementPublication", "lookup.empty");
    } else if (
      entry.key.requestId === requestId &&
      entry.key.documentId === documentId &&
      entry.key.baseRevision === baseRevision
    ) {
      emit("discardImportReplacementPublication", "lookup.match");
      liveEntry = null;
      emit("discardImportReplacementPublication", "remove.entry");
    } else {
      emit("discardImportReplacementPublication", "lookup.no-match");
      emit(
        "discardImportReplacementPublication",
        "preserve.unrelated-entry",
      );
      unrelatedEntryPreserved = true;
    }
    emit(
      "discardImportReplacementPublication",
      unrelatedEntryPreserved ? "return.live-zero-for-request" : "return.live-zero",
    );
    /*
     * Exact-result law: the identity crosses the boundary verbatim, and the
     * cleanup is total and nonthrowing even for hostile raw input outside the
     * typed surface. The assertion relabels the verbatim echo; it validates
     * nothing and no owner logic ever reads it back.
     */
    const identityEcho = Object.freeze(
      isPlainRecord(rawIdentity) ? { ...rawIdentity } : {},
    ) as ImportRequestIdentity;
    return Object.freeze({
      outcome: "invalidated-by-request",
      identity: identityEcho,
      liveForRequest: 0,
    });
  };

  const publish: PublishImportReplacementOperation = (handoff) => {
    emit("publishImportReplacement", "call.publish");
    const latest = readState();
    emit("publishImportReplacement", "read.controller-state");
    const raw: unknown = handoff;
    const rawPrepared = runtimeField(raw, "prepared");
    const rawRetirement = runtimeField(raw, "retirement");
    const rawIdentity = runtimeField(rawPrepared, "identity");
    /*
     * Same verbatim-echo posture as discard: the refusal identity repeats the
     * caller's identity value; the relabel validates nothing.
     */
    const identityEcho = Object.freeze(
      isPlainRecord(rawIdentity) ? { ...rawIdentity } : {},
    ) as ImportRequestIdentity;

    const refuse = (
      code:
        | "import.replacement_preparation_missing"
        | "import.replacement_preparation_stale"
        | "import.replacement_retirement_mismatch",
      identity: ImportRequestIdentity,
    ) => {
      emit("publishImportReplacement", "return.refused-live-zero");
      return Object.freeze({
        ok: false as const,
        outcome: "refused" as const,
        code,
        identity,
        observedDocumentId: latest.document.id,
        observedRevision: latest.revision,
        liveForRequest: 0 as const,
      });
    };

    const entry = liveEntry;
    if (
      entry === null ||
      !isPlainRecord(rawIdentity) ||
      entry.key.requestId !== rawIdentity["requestId"] ||
      entry.key.documentId !== rawIdentity["documentId"] ||
      entry.key.baseRevision !== rawIdentity["baseRevision"] ||
      !hasExactKeys(raw, HANDOFF_KEYS)
    ) {
      emit("publishImportReplacement", "lookup.no-authoritative-entry");
      // A missing, consumed, invalidated, or unrelated entry never publishes,
      // and an unrelated live entry is preserved untouched.
      return refuse("import.replacement_preparation_missing", identityEcho);
    }
    emit("publishImportReplacement", "lookup.exact-live-entry");
    if (rawPrepared !== entry.echo) {
      // A caller-created structural lookalike is never authority; the live
      // entry it names is consumed so no terminal path leaves it live.
      emit("publishImportReplacement", "compare.prepared-echo-mismatch");
      liveEntry = null;
      emit("publishImportReplacement", "consume.entry-before-return");
      return refuse("import.replacement_preparation_missing", entry.key);
    }
    const material = entry.material;
    const stale =
      latest.document.id !== entry.key.documentId ||
      latest.revision !== entry.key.baseRevision ||
      !deepStructuralEqual(
        latest.pendingRequests,
        material.pendingRequestsBefore,
      ) ||
      !deepStructuralEqual(
        latest.documentTransition,
        material.transitionBefore,
      ) ||
      !deepStructuralEqual(latest.bookmarks, material.bookmarksBefore) ||
      latest.nextSequence >= MAX_APPLICATION_SEQUENCE;
    if (stale) {
      emit("publishImportReplacement", "compare.preparation-stale");
      liveEntry = null;
      emit("publishImportReplacement", "consume.entry-before-return");
      return refuse("import.replacement_preparation_stale", entry.key);
    }
    /*
     * jcpe-94yu.3: the receipt must certify retirement of EXACTLY the latest
     * transport generation. A receipt claiming a NEWER generation than the
     * transport ever reached is not covering evidence — X1 cannot have
     * retired a generation that does not exist — and the pinned law refuses
     * it as a retirement mismatch (BRIDGE-REP-030/retirement-mismatch pins
     * receipt generation 12 against latest generation 11). A receipt older
     * than the latest generation stays refused as before
     * (BRIDGE-REP-030/transport-advanced-after-prepare).
     */
    const retirementValid =
      hasExactKeys(rawRetirement, RETIREMENT_KEYS) &&
      rawRetirement["requestId"] === entry.key.requestId &&
      rawRetirement["progressionRetired"] === true &&
      rawRetirement["previewRetired"] === true &&
      rawRetirement["noFutureAttack"] === true &&
      typeof rawRetirement["retiredTransportGeneration"] === "number" &&
      isNonnegativeSafeInteger(rawRetirement["retiredTransportGeneration"]) &&
      rawRetirement["retiredTransportGeneration"] >=
        material.expectedTransportGeneration &&
      rawRetirement["retiredTransportGeneration"] ===
        latest.transport.generation;
    if (!retirementValid) {
      emit("publishImportReplacement", "compare.retirement-mismatch");
      liveEntry = null;
      emit("publishImportReplacement", "consume.entry-before-return");
      return refuse("import.replacement_retirement_mismatch", entry.key);
    }
    emit("publishImportReplacement", "compare.exact-retirement");
    liveEntry = null;
    emit("publishImportReplacement", "consume.entry-before-publish");
    emit("publishImportReplacement", "construct.private-command");
    const next = applyPreparedImportReplacementToLatestState(latest, material);
    installState(next);
    emit("publishImportReplacement", "install.next-state");
    notifyListeners();
    emit("publishImportReplacement", "notify.after-install");
    emit(
      "publishImportReplacement",
      "return.committed-state-free-live-zero",
    );
    return Object.freeze({
      ok: true,
      outcome: "committed",
      identity: entry.key,
      documentId: material.document.id,
      revision: material.newRevision,
      effects: material.effects,
      counters: material.counters,
      liveForRequest: 0,
    });
  };

  const readIdentity: ReadCurrentApplicationDocumentIdentityOperation = () => {
    emit("readCurrentApplicationDocumentIdentity", "call.read-identity");
    const state = readState();
    emit("readCurrentApplicationDocumentIdentity", "read.controller-closure");
    emit(
      "readCurrentApplicationDocumentIdentity",
      "project.document-id-and-revision",
    );
    const identity = Object.freeze({
      documentId: state.document.id,
      revision: state.revision,
    });
    emit("readCurrentApplicationDocumentIdentity", "return.synchronously");
    return identity;
  };

  const publishMarker: PublishCanonicalExportRevisionOperation = (request) => {
    emit("publishCanonicalExportRevision", "call.publish-marker");
    /*
     * jcpe-94yu.3: `validate.envelope` is the pinned event for a VALID
     * envelope; a malformed request pins `validate.schema-refuse` alone
     * (BRIDGE-MARK-005), so the success event is emitted only after the
     * check passes.
     */
    const raw: unknown = request;
    const rawPublication = runtimeField(raw, "publication");
    const revision = runtimeField(rawPublication, "revision");
    const documentId = runtimeField(rawPublication, "documentId");
    const envelopeValid =
      hasExactKeys(raw, MARKER_REQUEST_KEYS) &&
      hasExactKeys(rawPublication, MARKER_PUBLICATION_KEYS) &&
      runtimeField(rawPublication, "schema") ===
        CANONICAL_EXPORT_REVISION_PUBLICATION_SCHEMA &&
      typeof documentId === "string" &&
      documentId.length > 0 &&
      typeof revision === "number" &&
      isNonnegativeSafeInteger(revision);
    if (!envelopeValid) {
      emit("publishCanonicalExportRevision", "validate.schema-refuse");
      const observed = readState();
      emit(
        "publishCanonicalExportRevision",
        "read.controller-state-for-refusal",
      );
      emit(
        "publishCanonicalExportRevision",
        "return.no-install-no-listener",
      );
      return Object.freeze({
        ok: false,
        outcome: "refused",
        code: "export.marker_publication_failed",
        observedDocumentId: observed.document.id,
        observedRevision: observed.revision,
      });
    }
    emit("publishCanonicalExportRevision", "validate.envelope");
    /*
     * The atomic critical section: read, compare BOTH identity fields,
     * conditional single-field write, notify after install. No await or
     * microtask boundary may appear between the read and the install.
     *
     * jcpe-94yu.3: the pinned stale events name WHICH identity field went
     * stale (`compare.document-stale` for a different document,
     * `compare.revision-stale` for a matching document at another revision);
     * the paired `compare.document-id`/`compare.revision` events are the
     * pinned both-fields-match observation (BRIDGE-MARK-003/004).
     */
    const state = readState();
    emit("publishCanonicalExportRevision", "read.controller-state");
    if (documentId !== state.document.id || revision !== state.revision) {
      emit(
        "publishCanonicalExportRevision",
        documentId !== state.document.id
          ? "compare.document-stale"
          : "compare.revision-stale",
      );
      emit(
        "publishCanonicalExportRevision",
        "return.no-install-no-listener",
      );
      return Object.freeze({
        ok: false,
        outcome: "refused",
        code: "export.marker_publication_stale",
        observedDocumentId: state.document.id,
        observedRevision: state.revision,
      });
    }
    emit("publishCanonicalExportRevision", "compare.document-id");
    emit("publishCanonicalExportRevision", "compare.revision");
    if (state.exportRevision === revision) {
      emit("publishCanonicalExportRevision", "observe.marker-already-equal");
      emit(
        "publishCanonicalExportRevision",
        "return.no-install-no-listener",
      );
      return Object.freeze({
        ok: true,
        outcome: "published",
        documentId: state.document.id,
        revision: state.revision,
      });
    }
    const next = createExportRevisionMarkedState(state, revision);
    emit(
      "publishCanonicalExportRevision",
      "create.exportRevision-only-state",
    );
    installState(next);
    emit("publishCanonicalExportRevision", "install.state");
    notifyListeners();
    emit(
      "publishCanonicalExportRevision",
      "notify.listeners-after-install",
    );
    emit("publishCanonicalExportRevision", "return.state-free");
    return Object.freeze({
      ok: true,
      outcome: "published",
      documentId: state.document.id,
      revision: state.revision,
    });
  };

  return Object.freeze({
    prepareImportReplacementPublication: prepare,
    discardImportReplacementPublication: discard,
    publishImportReplacement: publish,
    readCurrentApplicationDocumentIdentity: readIdentity,
    publishCanonicalExportRevision: publishMarker,
  });
}
