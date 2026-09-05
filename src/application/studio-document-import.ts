import { selectReplacementConfirmation } from "./studio-replacement-confirmation";
import { createProductionStableIdFactory, decodeDocumentShape, preflightDocumentImportBytes } from "../domain";
import { migrateLegacyJson } from "../compatibility";
import { parseChartText, parseChordSymbol, resolveChord } from "../theory";
import type { RecoveryService } from "../persistence";
import { applicationHistoryRetainedByteEstimator } from "./application-state";
import { createWorkCounters } from "./application-state-helpers";
import { validateDocumentSemantics } from "./document-validation";
import { buildChartDocumentCandidate, classifyJsonLexically, createPrepareImportPreviewCoordinator,
  decodeUtf8Fatal, parseJsonData, readImportSource } from "./e0-interchange";
import { IMPORT_FORMAT_HINTS, MAX_E0_IMPORT_UTF8_BYTES, type ImportFormatHint,
  type ImportPreview, type ImportPreviewReportItem, type ImportPreviewSummary,
  type ImportSourceHandle, type X1ReplacementRetirementAdapter } from "./e0-interchange-contract";
import { createE0V2TransactionDriver, projectPreviewToCommitRequestV2 } from "./e0-transaction-driver";
import { assessReplacementImpactOverState } from "./studio-interchange-owner";
import type { StudioComposition } from "./studio-controller";
import type { ApplicationCommandDependencies } from "./application-state-contract";

const DIALOG_ID = "studio-document-import";
const REPORT_GROUPS = ["preserved", "canonicalized", "custom", "ignored", "rejected"] as const;
export type StudioImportView = Readonly<{
  open: boolean;
  phase: "input" | "reading" | "preview" | "confirm" | "committing" | "failed" | "chart-text";
  title: string | null;
  sourceFormat: string | null;
  summary: ImportPreviewSummary | null;
  groups: readonly Readonly<{ name: string; items: readonly ImportPreviewReportItem[] }>[];
  omittedItems: number;
  issueCodes: readonly string[];
  message: string | null;
  confirmationRequired: boolean;
  nonUndoable: boolean;
  exportRecommended: boolean;
}>;
export type StudioDocumentImport = Readonly<{
  getSnapshot: () => StudioImportView;
  subscribe: (listener: () => void) => () => void;
  open: () => void;
  cancel: () => void;
  previewFile: (file: File, hint: ImportFormatHint) => Promise<void>;
  previewPaste: (text: string, hint: ImportFormatHint) => Promise<void>;
  /** Also used by composition-owned local sources; never starts replacement. */
  previewSource: (source: ImportSourceHandle, hint: ImportFormatHint) => Promise<void>;
  requestCommit: () => Promise<void>;
  confirm: (acknowledgeNonUndoable: boolean) => Promise<void>;
  backToPreview: () => void;
  invalidatePreview: () => void;
  exportCurrentFirst: () => void;
  stageChartText: () => void;
}>;

/** The decoded candidate, identity and acknowledgement remain composition-owned. */
export function createStudioDocumentImport(options: Readonly<{
  composition: StudioComposition;
  retirement: X1ReplacementRetirementAdapter;
  recovery: RecoveryService;
  exportCurrent: () => void;
  estimateHistoryRetainedBytes?: ApplicationCommandDependencies["estimateHistoryRetainedBytes"];
}>): StudioDocumentImport {
  const { composition } = options;
  const workflow = composition.replacementWorkflow;
  const driver = createE0V2TransactionDriver(composition.interchangeOwner, options.retirement);
  const estimate = options.estimateHistoryRetainedBytes ?? applicationHistoryRetainedByteEstimator;
  const idFactory = createProductionStableIdFactory();
  const prepare = createPrepareImportPreviewCoordinator({ preflightDocumentImportBytes, decodeUtf8Fatal,
    classifyJsonLexically, parseJsonData, decodeDocumentShape, validateDocumentSemantics,
    migrateLegacyJson, legacyMigrationDependencies: { idFactory, parseChordSymbol, resolveChord },
    parseChartText, buildChartDocumentCandidate, chartIdFactory: idFactory,
    assessImportReplacementImpact: (context, candidate) => {
      const result = assessReplacementImpactOverState(context.state, candidate, context.command, estimate, createWorkCounters());
      return result.ok ? { ok: true, value: result.impact } : { ok: false, code: "import.replacement_impact_unavailable" };
    },
  });
  let view: StudioImportView = Object.freeze({ open: false, phase: "input", title: null, sourceFormat: null,
    summary: null, groups: [], omittedItems: 0, issueCodes: [], message: null,
    confirmationRequired: false, nonUndoable: false, exportRecommended: false });
  let preview: ImportPreview | null = null;
  let chartText: string | null = null;
  let readAbort: AbortController | null = null;
  const listeners = new Set<() => void>();
  const hosted = (): boolean => composition.readApplicationState().dialogs.some((dialog) => dialog.id === DIALOG_ID);
  function publish(patch: Partial<StudioImportView>): void {
    view = Object.freeze({ ...view, ...patch });
    for (const listener of listeners) listener();
  }
  function failure(code: string, message = "The current chart is unchanged. Choose the source again to retry."): void {
    preview = null;
    chartText = null;
    workflow.applyLifecycleIntent({ kind: "set-import-draft", draft: null });
    workflow.updateLifecycleDialogPhase(DIALOG_ID, "failed");
    publish({ phase: "failed", issueCodes: [code], message: `${code}: ${message}` });
  }
  function cancel(): void {
    if (view.phase === "committing") return;
    if (hosted()) {
      const popped = workflow.applyLifecycleIntent({ kind: "pop-dialog", dialogId: DIALOG_ID });
      if (!popped.ok) { failure(popped.code, "Close the topmost dialog first."); return; }
    }
    readAbort?.abort();
    readAbort = null;
    preview = null;
    chartText = null;
    workflow.applyLifecycleIntent({ kind: "set-import-draft", draft: null });
    publish({ open: false, phase: "input", message: null });
  }
  function current(prepared: ImportPreview): boolean {
    const state = composition.readApplicationState();
    return state.document.id === prepared.identity.documentId && state.revision === prepared.identity.baseRevision;
  }
  function confirmationFacts(): Pick<StudioImportView, "confirmationRequired" | "exportRecommended"> {
    return selectReplacementConfirmation(composition.readApplicationState(), options.recovery.inspectRecovery());
  }
  async function previewSource(source: ImportSourceHandle, hint: ImportFormatHint): Promise<void> {
    if (!view.open || !hosted() || view.phase === "committing") return;
    readAbort?.abort();
    readAbort = new AbortController();
    const attempt = readAbort;
    preview = null;
    chartText = null;
    if (!IMPORT_FORMAT_HINTS.includes(hint)) { failure("import.format_mismatch"); return; }
    const identity = workflow.allocatePreviewIdentity();
    if (identity === null) { failure("import.replacement_workflow_busy"); return; }
    const state = composition.readApplicationState();
    const command = { id: `document-import-${String(identity.requestId)}`, label: "Import chart",
      logicalTimeMs: Math.max(identity.requestId, state.history.undo.at(-1)?.lastLogicalTimeMs ?? 0) };
    const draft = workflow.applyLifecycleIntent({ kind: "set-import-draft", draft: {
      id: DIALOG_ID, origin: hint === "legacy-json" ? "legacy-import" : "canonical-import", baseRevision: identity.baseRevision,
      readRequestId: identity.requestId, status: "reading", candidate: null, issueCodes: [],
    } });
    if (!draft.ok) { failure(draft.code); return; }
    workflow.updateLifecycleDialogPhase(DIALOG_ID, "open");
    publish({ phase: "reading", title: null, sourceFormat: null, summary: null, groups: [], omittedItems: 0, issueCodes: [], message: null,
      nonUndoable: false, ...confirmationFacts() });
    try {
      const read = await readImportSource({ identity, source }, attempt.signal);
      if (attempt.signal.aborted || readAbort !== attempt || !hosted()) return;
      if (!read.ok) { failure(read.code); return; }
      const now = composition.readApplicationState();
      if (now.document.id !== identity.documentId || now.revision !== identity.baseRevision) { failure("command.stale_revision"); return; }
      if (!preflightDocumentImportBytes(read.value.bytes.byteLength).ok) { failure("limit.import_bytes_exceeded"); return; }
      const decodedText = decodeUtf8Fatal(read.value.bytes);
      if (!decodedText.ok) { failure(decodedText.code); return; }
      const first = decodedText.value.trimStart().charAt(0);
      // A leading section marker is legal chart text. Let the existing parser
      // disambiguate it from JSON arrays; never invent a second text grammar.
      const sectionText = first === "[" && composition.controller.previewChartText(decodedText.value).status === "ready";
      if ((hint === "auto" || hint === "chart-text") && first !== "{" && (first !== "[" || sectionText)) {
        chartText = decodedText.value;
        const draftPreview = composition.controller.previewChartText(chartText);
        workflow.applyLifecycleIntent({ kind: "set-import-draft", draft: null });
        publish({ phase: "chart-text", sourceFormat: "chart-text-v1", issueCodes: draftPreview.issueCodes,
          message: "Chart text is insert-only. Send it to Quick entry, then review and apply it there. The current chart is unchanged." });
        return;
      }
      const result = prepare({ payload: read.value, formatHint: hint,
        replacementImpactContext: { state, command },
        nonUndoableConfirmationSeed: { confirmationId: `import-consent-${String(identity.requestId)}` },
      });
      if (!result.ok) {
        workflow.applyLifecycleIntent({ kind: "set-import-draft", draft: null });
        failure(result.refusal.code);
        publish({ issueCodes: Object.freeze([...new Set([result.refusal.code,
          ...result.refusal.issues.retained.map((issue) => issue.code),
          ...(result.refusal.legacyRefusal === null ? [] : [result.refusal.legacyRefusal.code])])]) });
        return;
      }
      if (result.value.sourceFormat === "chart-text-v1") {
        const text = decodeUtf8Fatal(read.value.bytes);
        if (!text.ok) { failure(text.code); return; }
        chartText = text.value;
        workflow.applyLifecycleIntent({ kind: "set-import-draft", draft: null });
        publish({ phase: "chart-text", sourceFormat: result.value.sourceFormat,
          message: "Chart text is insert-only. Send it to Quick entry, then review and apply it there. The current chart is unchanged." });
        return;
      }
      preview = result.value;
      const installed = workflow.applyLifecycleIntent({ kind: "set-import-draft", draft: {
        id: DIALOG_ID, origin: preview.replacementOrigin, baseRevision: identity.baseRevision,
        readRequestId: identity.requestId, status: "ready", candidate: preview.candidate, issueCodes: [],
      } });
      if (!installed.ok) { preview = null; failure(installed.code); return; }
      publish({ phase: "preview", title: preview.candidate.title, sourceFormat: preview.sourceFormat, summary: preview.summary,
        groups: Object.freeze(REPORT_GROUPS.map((name) => Object.freeze({ name,
          items: Object.freeze(result.value.report.retainedItems.filter((item) => item.code.startsWith(`legacy.${name}.`))),
        }))), omittedItems: preview.report.omittedItems,
        ...confirmationFacts(), nonUndoable: preview.replacementImpact.undoDisposition === "explicitly-unavailable",
        exportRecommended: confirmationFacts().exportRecommended || preview.replacementImpact.undoDisposition === "explicitly-unavailable" });
    } catch {
      if (!attempt.signal.aborted && readAbort === attempt) failure("import.read_failed");
    }
  }
  async function commit(acknowledgeNonUndoable: boolean): Promise<void> {
    if (!hosted() || preview === null || (view.phase !== "preview" && view.phase !== "confirm")) return;
    const chosen = preview;
    if (!current(chosen)) { failure("command.stale_revision"); return; }
    const facts = confirmationFacts();
    if ((facts.confirmationRequired || view.nonUndoable) && view.phase !== "confirm") {
      publish({ phase: "confirm", ...facts, exportRecommended: facts.exportRecommended || view.nonUndoable }); return;
    }
    if (chosen.nonUndoableConfirmationRequirement !== null && !acknowledgeNonUndoable) {
      publish({ message: "history.nonundoable_confirmation_required: Confirm that this replacement cannot be undone." }); return;
    }
    if (!workflow.updateLifecycleDialogPhase(DIALOG_ID, "committing").ok) { failure("ephemeral.intent_invalid"); return; }
    publish({ phase: "committing", message: null });
    const begun = workflow.begin({ candidateDocumentId: chosen.candidate.id, origin: chosen.replacementOrigin,
      undoDisposition: chosen.replacementImpact.undoDisposition, previewIdentity: chosen.identity });
    if (!begun.ok) { failure(begun.code); return; }
    const acknowledgement = chosen.nonUndoableConfirmationRequirement === null ? null
      : { kind: "acknowledged" as const, requirement: chosen.nonUndoableConfirmationRequirement };
    const projected = projectPreviewToCommitRequestV2(chosen, begun.transition, acknowledgement);
    if (!projected.ok) { workflow.cancel(begun.identity); failure(projected.code); return; }
    try {
      const result = await driver(projected.value);
      if (!result.ok) {
        workflow.cancel(begun.identity);
        failure(result.outcome === "refused" ? result.code : "import.replacement_retirement_evidence_invalid"); return;
      }
      preview = null;
      chartText = null;
      readAbort = null;
      // Publication normally clears the stack; use LIFO if a host retained it.
      if (composition.readApplicationState().dialogs.at(-1)?.id === DIALOG_ID) workflow.applyLifecycleIntent({ kind: "pop-dialog", dialogId: DIALOG_ID });
      publish({ open: false, phase: "input", message: view.nonUndoable
        ? "Imported chart. Undo is unavailable because this replacement exceeded the history boundary."
        : "Imported chart. Undo restores the previous chart." });
    } catch {
      workflow.cancel(begun.identity);
      failure("import.replacement_request_invalid");
    }
  }
  return Object.freeze({
    getSnapshot: () => hosted() ? view : Object.freeze({ ...view, open: false }),
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    open: () => {
      if (view.open && hosted()) return;
      readAbort?.abort(); readAbort = null; preview = null; chartText = null;
      const pushed = workflow.applyLifecycleIntent({ kind: "push-dialog", dialog: {
        id: DIALOG_ID, kind: "import-preview", phase: "open", blocksHistory: false, requestId: null,
      } });
      if (!pushed.ok) { failure(pushed.code); return; }
      publish({ open: true, phase: "input", title: null, sourceFormat: null, summary: null, groups: [], issueCodes: [], message: null,
        omittedItems: 0, nonUndoable: false, ...confirmationFacts() });
    },
    cancel, previewSource,
    previewFile: (file, hint) => previewSource({ channel: "file", displayName: file.name.slice(0, 255),
      mediaType: file.type.slice(0, 255), declaredByteLength: file.size,
      readAtMost: async (maximum, signal) => {
        const bytes = new Uint8Array(await file.slice(0, maximum).arrayBuffer());
        return signal.aborted ? { ok: false, outcome: "cancelled", code: "import.read_cancelled" }
          : { ok: true, bytes, observedByteLength: bytes.length };
      },
    }, hint),
    previewPaste: async (text, hint) => {
      if (!view.open || !hosted() || view.phase === "committing") return;
      if (text.length > MAX_E0_IMPORT_UTF8_BYTES) {
        readAbort?.abort(); readAbort = null;
        failure("limit.import_bytes_exceeded"); return;
      }
      await previewSource({ channel: "paste", displayName: null, mediaType: "text/plain", declaredByteLength: null,
        readAtMost: (maximum) => {
          const bytes = new TextEncoder().encode(text).slice(0, maximum);
          return Promise.resolve({ ok: true, bytes, observedByteLength: bytes.length });
        },
      }, hint);
    },
    requestCommit: () => commit(false), confirm: commit,
    backToPreview: () => { if (view.phase === "confirm") publish({ phase: "preview", message: null }); },
    invalidatePreview: () => {
      if (!view.open || view.phase === "committing") return;
      readAbort?.abort(); readAbort = null; preview = null; chartText = null;
      workflow.applyLifecycleIntent({ kind: "set-import-draft", draft: null });
      workflow.updateLifecycleDialogPhase(DIALOG_ID, "open");
      publish({ phase: "input", title: null, sourceFormat: null, summary: null, groups: [], omittedItems: 0, issueCodes: [], message: null });
    },
    exportCurrentFirst: () => { if (view.phase === "committing") return; cancel(); if (!view.open) options.exportCurrent(); },
    stageChartText: () => {
      if (view.phase !== "chart-text" || chartText === null) return;
      const checked = composition.controller.previewChartText(chartText);
      const result = composition.controller.setQuickEntryDraft(chartText, null, checked.status, checked.issueCodes);
      if (!result.ok) { failure(result.refusal.code); return; }
      cancel();
      publish({ message: "Chart text is in Quick entry. Review it before inserting." });
    },
  });
}
