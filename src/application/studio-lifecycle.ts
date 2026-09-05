import { decodeDocumentShape, documentsSemanticallyEqual } from "../domain";
import { createCanonicalJsonExportCoordinator, sanitizeExportFilename,
  type HashBytes, type StartPreparedExportDelivery } from "../export";
import type { RecoveryService } from "../persistence";
import { validateDocumentSemantics } from "./document-validation";
import { createPreparedCanonicalExportDeliveryRegistry } from "./e0-interchange";
import { createE0V2ExportDeliveryClickDriver, createE0V2ExportDeliveryPrepareDriver,
  createE0V2MarkerSettlementDriver } from "./e0-transaction-driver";
import type { CanonicalExportPreparationBinding, CanonicalExportPreparationId, MarkerEligibleCanonicalExportDelivery } from "./e0-interchange-contract";
import type { StudioComposition } from "./studio-controller";

export type StudioLifecycleView = Readonly<{
  dialog: "export" | null;
  phase: "preparing" | "ready" | "delivering" | "complete" | "failed";
  filename: string | null;
  byteLength: number | null;
  revision: number | null;
  message: string | null;
}>;

export type StudioLifecycleService = Readonly<{
  getSnapshot: () => StudioLifecycleView;
  subscribe: (listener: () => void) => () => void;
  openExport: () => Promise<void>;
  deliverCanonicalExport: () => Promise<void>;
  cancelLifecycleDialog: () => void;
}>;

const DIALOG_ID = "studio-lifecycle-export";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Treat the adapter's completion as untrusted even after the driver's envelope check. */
function isExactCanonicalDelivery(value: unknown, binding: CanonicalExportPreparationBinding): value is MarkerEligibleCanonicalExportDelivery {
  if (!isRecord(value) || !isRecord(value["artifact"])) return false;
  const artifact = value["artifact"];
  if (Object.keys(value).length !== 9 || Object.keys(artifact).length !== 5 ||
      value["ok"] !== true || value["bytesOffered"] !== binding.byteLength ||
      value["cleanup"] !== "complete" || value["outstandingOwnedResources"] !== 0 ||
      artifact["kind"] !== "canonical-json" || artifact["sourceDocumentId"] !== binding.documentId ||
      artifact["filename"] !== binding.filename || artifact["byteLength"] !== binding.byteLength ||
      artifact["semanticDocumentHash"] !== binding.semanticDocumentHash) return false;
  return (value["outcome"] === "handed-off" && value["channel"] === "object-url-download" &&
    value["objectUrlsCreated"] === 1 && value["objectUrlsRevoked"] === 1) ||
    (value["outcome"] === "completed" && value["channel"] === "file-system-access" &&
    value["objectUrlsCreated"] === 0 && value["objectUrlsRevoked"] === 0);
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
  let view: StudioLifecycleView = Object.freeze({ dialog: null, phase: "ready",
    filename: null, byteLength: null, revision: null, message: null });
  const listeners = new Set<() => void>();
  let sequence = 0;
  let preparing = false;
  let preparationId: CanonicalExportPreparationId | null = null;
  let artifact: Readonly<{ binding: CanonicalExportPreparationBinding; sha256: string }> | null = null;

  function publish(patch: Partial<StudioLifecycleView>): void {
    view = Object.freeze({ ...view, ...patch });
    for (const listener of listeners) listener();
  }

  function fail(code: string, message: string): void {
    publish({ phase: "failed", message: `${message} (${code})` });
  }

  function phase(value: "open" | "committing" | "failed"): boolean {
    return composition.updateLifecycleDialogPhase(DIALOG_ID, value).ok;
  }

  return Object.freeze({
    getSnapshot: () => composition.readApplicationState().dialogs.some((dialog) => dialog.id === DIALOG_ID)
      ? view : Object.freeze({ ...view, dialog: null }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    openExport: async () => {
      if (preparing || view.phase === "delivering" || composition.readApplicationState().dialogs.some((dialog) => dialog.id === DIALOG_ID)) return;
      if (sequence >= Number.MAX_SAFE_INTEGER - 1) { fail("export.preparation_sequence_exhausted", "The export request sequence is exhausted"); return; }
      const pushed = composition.applyLifecycleIntent({ kind: "push-dialog", dialog: {
        id: DIALOG_ID, kind: "lifecycle-export", phase: "open", blocksHistory: false, requestId: null,
      } });
      if (!pushed.ok) { fail(pushed.code, "The export dialog could not be opened"); return; }
      preparing = true;
      const requestId = ++sequence;
      const state = composition.readApplicationState();
      publish({ dialog: "export", phase: "preparing", filename: null, byteLength: null,
        revision: state.revision, message: null });
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
        if (preparationId !== null) registry.abandonPreparation(preparationId);
      } finally {
        preparing = false;
      }
    },
    cancelLifecycleDialog: () => {
      if (view.dialog === null || view.phase === "delivering") return;
      const popped = composition.applyLifecycleIntent({ kind: "pop-dialog", dialogId: DIALOG_ID });
      if (!popped.ok) { fail(popped.code, "Close the topmost dialog first"); return; }
      sequence += 1;
      if (preparationId !== null) registry.abandonPreparation(preparationId);
      preparationId = null;
      artifact = null;
      publish({ dialog: null, message: null });
    },
    deliverCanonicalExport: async () => {
      if (view.phase !== "ready" || artifact === null || preparationId === null) return;
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
