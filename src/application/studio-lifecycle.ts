import { decodeDocumentShape, documentsSemanticallyEqual } from "../domain";
import { createCanonicalJsonExportCoordinator, createLeadSheetTextExportCoordinator,
  sanitizeExportFilename, supportedDocumentProjectionEquals, LEAD_SHEET_TEXT_LOSS_CODES,
  type ExportDeliveryArtifactBinding, type HashBytes, type LeadSheetTextLossCode,
  type PreparedExportDeliveryRequest, type StartPreparedExportDelivery } from "../export";
import type { RecoveryService } from "../persistence";
import { formatChordSymbol, parseChartText } from "../theory";
import { validateDocumentSemantics } from "./document-validation";
import { createPreparedCanonicalExportDeliveryRegistry } from "./e0-interchange";
import { createE0V2ExportDeliveryClickDriver, createE0V2ExportDeliveryPrepareDriver,
  createE0V2MarkerSettlementDriver } from "./e0-transaction-driver";
import type { CanonicalExportPreparationBinding, CanonicalExportPreparationId, MarkerEligibleCanonicalExportDelivery } from "./e0-interchange-contract";
import type { StudioComposition } from "./studio-controller";

export type StudioLifecycleView = Readonly<{
  dialog: "export" | null;
  format: "canonical-json" | "lead-sheet-text";
  losses: readonly Readonly<{ label: string; count: number }>[];
  phase: "preparing" | "ready" | "delivering" | "complete" | "failed";
  filename: string | null;
  byteLength: number | null;
  revision: number | null;
  message: string | null;
}>;

export type StudioLifecycleService = Readonly<{
  getSnapshot: () => StudioLifecycleView;
  subscribe: (listener: () => void) => () => void;
  openExport: (format?: StudioLifecycleView["format"]) => Promise<void>;
  deliverCanonicalExport: () => Promise<void>;
  deliverTextExport: () => Promise<void>;
  cancelLifecycleDialog: () => void;
}>;

const DIALOG_ID = "studio-lifecycle-export";
const LOSS_LABELS: Readonly<Record<LeadSheetTextLossCode, string>> = Object.freeze({
  "text.loss.stable_identities": "Stable chart, section, measure, and chord identities",
  "text.loss.playback_settings": "Instruments, groove, volume, reverb, and count-in settings",
  "text.loss.derived_analysis": "Contextual analysis",
  "text.loss.section_key_override": "Section key overrides",
  "text.loss.section_voice_leading_boundary": "Section voice-leading boundaries",
  "text.loss.source_symbol_alias": "Original chord-symbol aliases (replaced by canonical spellings)",
  "text.loss.auto_voicing_policy": "Auto voicing policies",
  "text.loss.manual_voicing": "Exact Manual pitches and octaves",
  "text.loss.frozen_voicing": "Exact Frozen pitches, octaves, and generator metadata",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Treat the adapter's completion as untrusted even after the driver's envelope check. */
function isExactDelivery(value: unknown, binding: ExportDeliveryArtifactBinding): boolean {
  if (!isRecord(value) || !isRecord(value["artifact"])) return false;
  const artifact = value["artifact"];
  if (Object.keys(value).length !== 9 || Object.keys(artifact).length !== 5 ||
      value["ok"] !== true || value["bytesOffered"] !== binding.byteLength ||
      value["cleanup"] !== "complete" || value["outstandingOwnedResources"] !== 0 ||
      artifact["kind"] !== binding.kind || artifact["sourceDocumentId"] !== binding.sourceDocumentId ||
      artifact["filename"] !== binding.filename || artifact["byteLength"] !== binding.byteLength ||
      artifact["semanticDocumentHash"] !== binding.semanticDocumentHash) return false;
  return (value["outcome"] === "handed-off" && value["channel"] === "object-url-download" &&
    value["objectUrlsCreated"] === 1 && value["objectUrlsRevoked"] === 1) ||
    (value["outcome"] === "completed" && value["channel"] === "file-system-access" &&
    value["objectUrlsCreated"] === 0 && value["objectUrlsRevoked"] === 0);
}

function isExactCanonicalDelivery(value: unknown, binding: CanonicalExportPreparationBinding): value is MarkerEligibleCanonicalExportDelivery {
  return isExactDelivery(value, { kind: "canonical-json", sourceDocumentId: binding.documentId,
    filename: binding.filename, byteLength: binding.byteLength, semanticDocumentHash: binding.semanticDocumentHash });
}

/** Typed, composition-owned workflow; Preact receives no bytes or owner ports. */
export function createStudioLifecycle(options: Readonly<{
  composition: StudioComposition;
  recovery: RecoveryService;
  hashBytes: HashBytes;
  startDelivery: StartPreparedExportDelivery;
  nowIso: () => string;
}>): StudioLifecycleService {
  const { composition, recovery } = options;
  const registry = createPreparedCanonicalExportDeliveryRegistry();
  const click = createE0V2ExportDeliveryClickDriver(composition.interchangeOwner, registry, options.startDelivery);
  const encode = createCanonicalJsonExportCoordinator({ decodeDocumentShape,
    validateCanonicalRoundTrip: validateDocumentSemantics,
    semanticallyEqualDocuments: documentsSemanticallyEqual,
    hashBytes: async (bytes) => ({ ok: true, digest: await options.hashBytes(bytes) }),
    sanitizeExportFilename });
  const encodeText = createLeadSheetTextExportCoordinator({ formatChordSymbol, parseChartText,
    supportedDocumentProjectionEquals, sanitizeExportFilename });
  let view: StudioLifecycleView = Object.freeze({ dialog: null, phase: "ready",
    format: "canonical-json", losses: Object.freeze([]),
    filename: null, byteLength: null, revision: null, message: null });
  const listeners = new Set<() => void>();
  let sequence = 0;
  let preparing = false;
  let preparationId: CanonicalExportPreparationId | null = null;
  let artifact: Readonly<{ binding: CanonicalExportPreparationBinding; sha256: string }> | null = null;
  let textArtifact: Readonly<{ request: PreparedExportDeliveryRequest; revision: number }> | null = null;

  function abandonCanonicalPreparation(): void {
    if (preparationId !== null) registry.abandonPreparation(preparationId);
    preparationId = null;
    artifact = null;
  }

  function publish(patch: Partial<StudioLifecycleView>): void {
    view = Object.freeze({ ...view, ...patch });
    for (const listener of listeners) listener();
  }

  function fail(code: string, message: string): void {
    publish({ phase: "failed", message: `${message} (${code})` });
  }

  function phase(value: "open" | "committing" | "failed"): boolean {
    return composition.replacementWorkflow.updateLifecycleDialogPhase(DIALOG_ID, value).ok;
  }

  return Object.freeze({
    getSnapshot: () => composition.readApplicationState().dialogs.some((dialog) => dialog.id === DIALOG_ID)
      ? view : Object.freeze({ ...view, dialog: null }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    openExport: async (format = "canonical-json") => {
      if (preparing || view.phase === "delivering" || composition.readApplicationState().dialogs.some((dialog) => dialog.id === DIALOG_ID)) return;
      if (sequence >= Number.MAX_SAFE_INTEGER - 1) { fail("export.preparation_sequence_exhausted", "The export request sequence is exhausted"); return; }
      const pushed = composition.replacementWorkflow.applyLifecycleIntent({ kind: "push-dialog", dialog: {
        id: DIALOG_ID, kind: "lifecycle-export", phase: "open", blocksHistory: false, requestId: null,
      } });
      if (!pushed.ok) { fail(pushed.code, "The export dialog could not be opened"); return; }
      abandonCanonicalPreparation();
      textArtifact = null;
      preparing = true;
      const requestId = ++sequence;
      const state = composition.readApplicationState();
      publish({ dialog: "export", phase: "preparing", format, losses: Object.freeze([]), filename: null, byteLength: null,
        revision: state.revision, message: null });
      if (format === "lead-sheet-text") {
        try {
          const hasAnalysis = state.document.sections.some((section) => section.measures.some((measure) =>
            measure.events.some((event) => composition.controller.readEventAnalysis(event.id) !== null)));
          const encoded = encodeText({ document: state.document, accidentalStyle: "ascii",
            contextualAnalysis: hasAnalysis ? "present" : "none" });
          if (!encoded.ok) {
            fail(encoded.refusal.code, `Chart text could not be prepared at ${JSON.stringify(encoded.refusal.path)}. Export JSON to keep the complete chart`);
            phase("failed");
            return;
          }
          const value = encoded.value;
          textArtifact = { revision: state.revision, request: Object.freeze({
            binding: Object.freeze({ kind: "lead-sheet-text", sourceDocumentId: value.sourceDocumentId,
              filename: value.filename, byteLength: value.byteLength, semanticDocumentHash: null }),
            privateBytes: new TextEncoder().encode(value.text), preference: "download-only",
          }) };
          publish({ phase: "ready", filename: value.filename, byteLength: value.byteLength,
            losses: Object.freeze(LEAD_SHEET_TEXT_LOSS_CODES.filter((code) => value.lossReport.countsByCode[code] > 0)
              .map((code) => Object.freeze({ label: LOSS_LABELS[code], count: value.lossReport.countsByCode[code] }))) });
        } catch {
          fail("export.text_preparation_failed", "Chart text could not be prepared. Close and try again, or export JSON");
          phase("failed");
        } finally {
          preparing = false;
        }
        return;
      }
      const preparedDigest: { sha256: string | null } = { sha256: null };
      const prepare = createE0V2ExportDeliveryPrepareDriver(composition.interchangeOwner, {
        ...registry,
        begin: (identity) => {
          const result = registry.begin(identity);
          if (result.ok) preparationId = result.identity.preparationId;
          return result;
        },
      }, async (request) => {
        const encoded = await encode(request);
        if (!encoded.ok) return encoded;
        // A1 persists the delivered FILE digest, distinct from its semantic hash.
        const digest = await options.hashBytes(new TextEncoder().encode(encoded.value.text));
        if (typeof digest !== "string" || !/^[a-f0-9]{64}$/u.test(digest)) {
          return { ok: false, refusal: { code: "export.hash_unavailable", path: [] } };
        }
        preparedDigest.sha256 = digest;
        return encoded;
      });
      try {
        const prepared = await prepare({ schema: "changes.canonical-export-delivery-request.v2",
          identity: { requestId, documentId: state.document.id, baseRevision: state.revision },
        }, state.document);
        if (requestId !== sequence) return;
        if (!prepared.ok || preparedDigest.sha256 === null) {
          const code = !prepared.ok && "code" in prepared ? prepared.code
            : !prepared.ok && prepared.outcome === "canonical-export-refused" && isRecord(prepared.refusal) &&
                typeof prepared.refusal["code"] === "string" ? prepared.refusal["code"] : "export.canonical_preparation_failed";
          fail(code, "JSON could not be prepared. The chart and export marker are unchanged; close and try again");
          phase("failed");
          return;
        }
        artifact = { binding: prepared.binding, sha256: preparedDigest.sha256 };
        publish({ phase: "ready", filename: prepared.binding.filename,
          byteLength: prepared.binding.byteLength, revision: prepared.binding.revision });
      } catch {
        if (requestId === sequence) {
          fail("export.canonical_preparation_failed", "JSON could not be prepared. The chart and export marker are unchanged; close and try again");
          phase("failed");
        }
        abandonCanonicalPreparation();
      } finally {
        preparing = false;
      }
    },
    cancelLifecycleDialog: () => {
      if (view.dialog === null || view.phase === "delivering") return;
      const popped = composition.replacementWorkflow.applyLifecycleIntent({ kind: "pop-dialog", dialogId: DIALOG_ID });
      if (!popped.ok) { fail(popped.code, "Close the topmost dialog first"); return; }
      sequence += 1;
      abandonCanonicalPreparation();
      textArtifact = null;
      publish({ dialog: null, message: null });
    },
    deliverTextExport: async () => {
      if (view.format !== "lead-sheet-text" || view.phase !== "ready" || textArtifact === null) return;
      const selected = textArtifact;
      textArtifact = null;
      const state = composition.readApplicationState();
      if (state.document.id !== selected.request.binding.sourceDocumentId || state.revision !== selected.revision) {
        fail("export.prepared_text_stale", "The chart changed after preparation. Close and export again");
        phase("failed");
        return;
      }
      if (!phase("committing")) {
        fail("ephemeral.intent_invalid", "The export dialog is no longer current");
        return;
      }
      publish({ phase: "delivering", message: null });
      try {
        // The same real E0 adapter consumes these single-use bytes synchronously
        // within the click. Text never enters the canonical marker registry.
        const started = options.startDelivery(selected.request);
        if (!isRecord(started) || Object.keys(started).length !== 1 || !(started["completion"] instanceof Promise)) {
          throw new Error("export.delivery_result_invalid");
        }
        const delivered: unknown = await started["completion"];
        if (!isExactDelivery(delivered, selected.request.binding)) {
          const code = isRecord(delivered) && typeof delivered["code"] === "string" && delivered["code"].length <= 128
            ? delivered["code"] : isRecord(delivered) && delivered["outcome"] === "cancelled"
              ? "export.delivery_cancelled" : "export.delivery_result_invalid";
          fail(code, "Delivery could not be verified. Close and try again");
          phase("failed");
          return;
        }
        if (!phase("open")) {
          fail("export.dialog_stale", "The browser received the text file, but this export dialog is no longer current");
          return;
        }
        publish({ phase: "complete", message: "Handed off to your browser. Check its downloads for the text file. Export JSON to keep a complete portable copy; the JSON export marker is unchanged." });
      } catch {
        fail("export.delivery_result_invalid", "The download could not be verified. Close and try again");
        phase("failed");
      }
    },
    deliverCanonicalExport: async () => {
      if (view.format !== "canonical-json" || view.phase !== "ready" || artifact === null || preparationId === null) return;
      const selected = artifact;
      const id = preparationId;
      artifact = null;
      preparationId = null;
      view = Object.freeze({ ...view, phase: "delivering", message: null });
      if (!phase("committing")) {
        registry.abandonPreparation(id);
        fail("ephemeral.intent_invalid", "The export dialog is no longer current");
        return;
      }
      publish({});
      // No await precedes click(): E0 invokes the real browser download inside
      // this trusted gesture, then validates/settles its completion separately.
      const completed = await click({ preparationId: id, deliveryPreference: "download-only" });
      if (!completed.ok) {
        fail("code" in completed ? completed.code : "export.delivery_result_invalid",
          "The download did not complete. The chart and export marker are unchanged; close and try again");
        phase("failed");
        return;
      }
      const delivery: unknown = completed.delivery;
      const binding = selected.binding;
      if (!isExactCanonicalDelivery(delivery, binding)) {
        const code = isRecord(delivery) && typeof delivery["code"] === "string" && delivery["code"].length <= 128
          ? delivery["code"] : isRecord(delivery) && delivery["outcome"] === "cancelled"
            ? "export.delivery_cancelled" : "export.delivery_result_invalid";
        fail(code, "Delivery could not be verified. The export marker is unchanged; close and try again");
        phase("failed");
        return;
      }
      const settle = createE0V2MarkerSettlementDriver(composition.interchangeOwner, async (handoff) => {
        const stored = await recovery.recordExportBinding({ schema: "changes.recovery-export-binding.v1",
          documentId: handoff.marker.documentId, exportRevision: handoff.marker.revision,
          exportedAt: handoff.marker.exportedAt, semanticDocumentHash: handoff.marker.semanticDocumentHash,
          artifactByteLength: handoff.artifact.byteLength, artifactSha256: selected.sha256,
        }, handoff.marker.revision);
        return stored.outcome === "recorded"
          ? { ok: true, outcome: "persisted", durability: "recovery-persisted" }
          : { ok: false, outcome: "failed", code: "recovery.marker_persistence_failed", durability: "pending-failed" };
      }, options.nowIso);
      const settled = await settle({ schema: "changes.canonical-export-marker-settlement-request.v2",
        ownerRequest: { publication: { schema: "changes.canonical-export-revision-publication.v1",
          documentId: binding.documentId, revision: binding.revision } },
      }, delivery);
      phase("open");
      if (!settled.ok) {
        phase("failed");
        fail("code" in settled ? settled.code : "export.marker_publication_failed",
          "The browser received the file, but the current chart could not be marked exported. Export again to capture the latest revision");
        return;
      }
      publish({ phase: "complete", message: settled.durability === "recovery-persisted"
        ? "Handed off to your browser. Check its downloads to find the JSON file."
        : "Handed off to your browser. The export marker could not be kept in local recovery; check your downloaded JSON file." });
    },
  });
}
