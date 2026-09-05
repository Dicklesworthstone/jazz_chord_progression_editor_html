import { selectReplacementConfirmation } from "./studio-replacement-confirmation";
import { DEFAULT_GROOVE_STYLE_ID, createProductionStableIdFactory, decodeDocumentShape, type ValidatedDocument } from "../domain";
import { parseChartText } from "../theory";
import type { RecoveryService } from "../persistence";
import { applicationHistoryRetainedByteEstimator } from "./application-state";
import type { ApplicationCommandDependencies } from "./application-state-contract";
import { createWorkCounters, deepStructuralEqual, runtimeField } from "./application-state-helpers";
import { validateDocumentSemantics } from "./document-validation";
import { buildChartDocumentCandidate } from "./e0-interchange";
import { X1_REPLACEMENT_RETIREMENT_EVIDENCE_SCHEMA } from "./e0-interchange-contract";
import { publishBlankStudioDocument } from "./studio-bootstrap";
import type { StudioComposition } from "./studio-controller";
import { assessReplacementImpactOverState } from "./studio-interchange-owner";
import type { LocalReplacementOrigin, LocalReplacementRequest } from "./studio-local-replacement-owner";
import { PROGRESSION_LIBRARY } from "./studio-progression-library";
import type { LocalReplacementRetirementRequest, StudioReplacementRetirementAdapter } from "./x1-retirement-adapter";

const DIALOG_ID = "studio-local-replacement";
export type StudioLocalReplacementView = Readonly<{
  open: boolean; phase: "confirm" | "committing" | "failed";
  origin: LocalReplacementOrigin; title: string; nonUndoable: boolean;
  exportRecommended: boolean; message: string | null; triggerId: string;
  reconciliationRequired: boolean;
}>;
export type StudioLocalReplacementService = Readonly<{
  getSnapshot: () => StudioLocalReplacementView;
  subscribe: (listener: () => void) => () => void;
  requestNew: () => Promise<void>;
  requestLesson: (id: string, focusOwnerId?: string) => Promise<void>;
  confirm: (acknowledged: boolean) => Promise<void>;
  cancel: () => void;
  exportCurrentFirst: () => void;
}>;

/** Complete candidates are prepared without borrowing the live controller's edit channel. */
export function createStudioLocalReplacement(options: Readonly<{
  composition: StudioComposition; retirement: Pick<StudioReplacementRetirementAdapter, "retireLocalReplacement">;
  recovery: RecoveryService; exportCurrent: () => void;
  estimateHistoryRetainedBytes?: ApplicationCommandDependencies["estimateHistoryRetainedBytes"];
}>): StudioLocalReplacementService {
  const { composition } = options;
  const workflow = composition.replacementWorkflow;
  const ids = createProductionStableIdFactory();
  const estimate = options.estimateHistoryRetainedBytes ?? applicationHistoryRetainedByteEstimator;
  let chosen: Omit<LocalReplacementRequest, "acknowledgedNonUndoable"> | null = null;
  let confirmationRequired = false;
  let view: StudioLocalReplacementView = Object.freeze({ open: false, phase: "confirm", origin: "new",
    title: "Untitled Chart", nonUndoable: false, exportRecommended: false, message: null,
    triggerId: "studio-new-chart", reconciliationRequired: false });
  const listeners = new Set<() => void>();
  const hosted = (): boolean => composition.readApplicationState().dialogs.some(d => d.id === DIALOG_ID);
  const publish = (patch: Partial<StudioLocalReplacementView>): void => {
    view = Object.freeze({ ...view, ...patch });
    for (const listener of listeners) listener();
  };
  function failure(code: string, reconciliationRequired = false): void {
    chosen = null;
    if (hosted()) workflow.updateLifecycleDialogPhase(DIALOG_ID, "failed");
    publish({ phase: "failed", reconciliationRequired, message: reconciliationRequired
      ? `${code}: The current chart is preserved. Playback could not prove a safe stop. Reload the studio before further editing or playback.`
      : `${code}: The current chart is unchanged. Cancel and choose New or a lesson again to retry.` });
  }
  function cancel(): void {
    if (view.phase === "committing" || view.reconciliationRequired) return;
    if (hosted() && !workflow.applyLifecycleIntent({ kind: "pop-dialog", dialogId: DIALOG_ID }).ok) return;
    chosen = null;
    publish({ open: false, message: null });
  }
  async function confirm(acknowledged: boolean): Promise<void> {
    if (!hosted() || chosen === null || view.phase !== "confirm") return;
    const selected = chosen;
    const state = composition.readApplicationState();
    if (state.document.id !== selected.identity.documentId || state.revision !== selected.identity.baseRevision) {
      failure("command.stale_revision"); return;
    }
    if (view.nonUndoable && !acknowledged) {
      publish({ message: "history.nonundoable_confirmation_required: Acknowledge the displayed history boundary." }); return;
    }
    if (!workflow.updateLifecycleDialogPhase(DIALOG_ID, "committing").ok) { failure("ephemeral.intent_invalid"); return; }
    publish({ phase: "committing", message: null });
    const begun = workflow.begin({ candidateDocumentId: selected.candidate.id, origin: selected.origin,
      undoDisposition: selected.disclosedImpact.undoDisposition, previewIdentity: selected.identity });
    if (!begun.ok) { failure(begun.code); return; }
    const prepared = workflow.localPublication.prepare({ ...selected, acknowledgedNonUndoable: acknowledged });
    if (!prepared.ok) { workflow.cancel(begun.identity); failure(prepared.code); return; }
    const request: LocalReplacementRetirementRequest = Object.freeze({ ...prepared.preparation,
      scope: "progression-and-preview", requiredPostcondition: "zero-future-attack" });
    let raw: unknown;
    try { raw = await options.retirement.retireLocalReplacement(request); }
    catch { raw = null; }
    const value = runtimeField(raw, "value");
    const receipt = runtimeField(value, "receipt");
    const valid = runtimeField(raw, "ok") === true && runtimeField(value, "schema") === X1_REPLACEMENT_RETIREMENT_EVIDENCE_SCHEMA &&
      runtimeField(value, "authority") === "x1-serialized-transport" && deepStructuralEqual(runtimeField(value, "request"), request) &&
      deepStructuralEqual(receipt, { requestId: request.identity.requestId, retiredTransportGeneration: request.expectedTransportGeneration,
        progressionRetired: true, previewRetired: true, noFutureAttack: true });
    if (!valid) {
      workflow.localPublication.discard(begun.identity);
      const noEffect = runtimeField(raw, "ok") === false && runtimeField(raw, "retirementEffect") === "none" &&
        ["transport.replacement_retirement_failed", "transport.replacement_retirement_stale", "transport.replacement_retirement_unavailable"].includes(String(runtimeField(raw, "code")));
      if (noEffect) workflow.cancel(begun.identity);
      failure(noEffect ? "transport.replacement_retirement_failed" : "transport.replacement_retirement_evidence_invalid", !noEffect);
      return;
    }
    const result = workflow.localPublication.publish(prepared.preparation, {
      requestId: request.identity.requestId, retiredTransportGeneration: request.expectedTransportGeneration,
      progressionRetired: true, previewRetired: true, noFutureAttack: true,
    });
    if (!result.ok) { workflow.cancel(begun.identity); failure(result.code); return; }
    chosen = null;
    // U0 restores this dialog's owner. Consume the generic chart-focus request
    // before closing the host so the chart render cannot override that restore.
    const focus = composition.readApplicationState().focusRequest;
    if (confirmationRequired && focus?.reason === "replacement") composition.controller.acknowledgeFocus(focus.sequence);
    workflow.applyLifecycleIntent({ kind: "pop-dialog", dialogId: DIALOG_ID });
    publish({ open: false, phase: "confirm", message: view.nonUndoable
      ? "Chart replaced. Undo is unavailable at this history boundary." : "Chart replaced. Undo restores the previous chart." });
  }
  async function request(origin: LocalReplacementOrigin, entryId?: string, focusOwnerId?: string): Promise<void> {
    if (view.open || view.reconciliationRequired) return;
    const before = composition.readApplicationState();
    if (before.dialogs.length > 0 || before.documentTransition.kind !== "idle") { failure("import.replacement_workflow_busy"); return; }
    const entry = origin === "lesson" ? PROGRESSION_LIBRARY.find(e => e.id === entryId) : null;
    if (entry === undefined) { failure("lesson.not_found"); return; }
    let candidate: ValidatedDocument;
    if (entry === null) {
      const blank = publishBlankStudioDocument();
      if (!blank.ok) { failure(blank.refusal.code); return; }
      const id = ids.next("document"); const section = ids.next("section"); const measure = ids.next("measure");
      if (!id.ok || !section.ok || !measure.ok) { failure("import.chart_id_factory_failed"); return; }
      const decoded = decodeDocumentShape({ ...blank.value, id: id.value, sections: [{
        id: section.value, name: "A", annotation: "", keyOverride: null, voiceLeadingBoundary: "reset",
        measures: [{ id: measure.value, events: [], completion: { kind: "empty" } }],
      }] });
      if (!decoded.ok) { failure("import.candidate_structural_invalid"); return; }
      const result = validateDocumentSemantics(decoded.value);
      if (!result.ok) { failure("import.candidate_semantic_invalid"); return; }
      candidate = result.value;
    } else {
      const parsed = parseChartText(entry.chartText, { mode: "fragment", meter: { beatsPerBar: 4, beatUnit: 4 } }, "ascii");
      if (!parsed.ok) { failure("import.chart_invalid"); return; }
      const built = buildChartDocumentCandidate(parsed.draft, ids);
      if (!built.ok) { failure(built.code); return; }
      const { grooveStyleId: ignoredGroove, ...playback } = before.document.playback;
      void ignoredGroove;
      const decoded = decodeDocumentShape({ ...built.value, title: entry.title, tempoBpm: entry.tempoBpm ?? before.document.tempoBpm,
        playback: entry.grooveStyleId === DEFAULT_GROOVE_STYLE_ID ? playback : { ...playback, grooveStyleId: entry.grooveStyleId } });
      if (!decoded.ok) { failure("import.candidate_structural_invalid"); return; }
      const result = validateDocumentSemantics(decoded.value);
      if (!result.ok) { failure("import.candidate_semantic_invalid"); return; }
      candidate = result.value;
    }
    const identity = workflow.allocatePreviewIdentity();
    if (identity === null) { failure("import.replacement_workflow_busy"); return; }
    const command = Object.freeze({ id: `local-replacement-${String(identity.requestId)}`, label: origin === "new" ? "New chart" : "Load lesson",
      logicalTimeMs: Math.max(identity.requestId, before.history.undo.at(-1)?.lastLogicalTimeMs ?? 0) });
    const assessed = assessReplacementImpactOverState(before, candidate, command, estimate, createWorkCounters());
    if (!assessed.ok) { failure(assessed.code); return; }
    chosen = Object.freeze({ identity, origin, candidate, command, disclosedImpact: assessed.impact });
    const facts = selectReplacementConfirmation(before, options.recovery.inspectRecovery());
    confirmationRequired = facts.confirmationRequired || assessed.oversized;
    const pushed = workflow.applyLifecycleIntent({ kind: "push-dialog", dialog: {
      id: DIALOG_ID, kind: origin === "new" ? "new-document" : "lesson-load", phase: "open", blocksHistory: false, requestId: identity.requestId } });
    if (!pushed.ok) { failure(pushed.code); return; }
    publish({ open: true, phase: "confirm", origin, title: candidate.title,
      nonUndoable: assessed.oversized, exportRecommended: facts.exportRecommended || assessed.oversized,
      message: null, triggerId: origin === "new" ? "studio-new-chart" : focusOwnerId ?? `studio-progression-${entryId ?? ""}` });
    if (!facts.confirmationRequired && !assessed.oversized) await confirm(false);
  }
  return Object.freeze({ getSnapshot: () => hosted() ? view : Object.freeze({ ...view, open: false }),
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    requestNew: () => request("new"), requestLesson: (id, focusOwnerId) => request("lesson", id, focusOwnerId), confirm, cancel,
    exportCurrentFirst: () => { if (view.phase === "committing") return; cancel(); if (!view.open) options.exportCurrent(); },
  });
}
