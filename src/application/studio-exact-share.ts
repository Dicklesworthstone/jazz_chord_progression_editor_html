import type { DialogDescriptor } from "./application-state-contract";
import { encodeExactShareDocument, exactShareUrl } from "./exact-share";
import type { StudioComposition } from "./studio-controller";
import type { StudioLifecycleService } from "./studio-lifecycle";

const DIALOG_ID = "studio-exact-share";
export type StudioExactShareView = Readonly<{
  open: boolean;
  url: string | null;
  revision: number | null;
  phase: "ready" | "oversized" | "failed" | "copied";
  copyPending: boolean;
  message: string | null;
}>;
export type StudioExactShareService = Readonly<{
  getSnapshot: () => StudioExactShareView;
  subscribe: (listener: () => void) => () => void;
  open: () => void;
  cancel: () => void;
  copy: () => Promise<void>;
  downloadJson: () => void;
}>;

/** Only the composition owns canonical documents and browser adapters. */
export function createStudioExactShare(options: Readonly<{
  composition: StudioComposition;
  lifecycle: StudioLifecycleService;
  readLocation: () => string;
  writeClipboard: (text: string) => Promise<void>;
}>): StudioExactShareService {
  const { composition } = options;
  const listeners = new Set<() => void>();
  let view: StudioExactShareView = Object.freeze({ open: false, url: null, revision: null,
    phase: "ready", copyPending: false, message: null });
  let bound: ReturnType<StudioComposition["readApplicationState"]> | null = null;
  let owner: DialogDescriptor | null = null;
  let inFlight: object | null = null;
  const top = () => composition.readApplicationState().dialogs.at(-1);
  const current = () => bound !== null && composition.readApplicationState().document === bound.document &&
    composition.readApplicationState().revision === bound.revision;
  function publish(patch: Partial<StudioExactShareView>): void {
    view = Object.freeze({ ...view, ...patch, copyPending: inFlight !== null });
    for (const listener of listeners) listener();
  }
  function prepare(message: string | null = null): void {
    bound = composition.readApplicationState();
    const encoded = encodeExactShareDocument(bound.document);
    if (!encoded.ok) {
      publish({ open: true, url: null, revision: bound.revision,
        phase: encoded.code === "share.limit_exceeded" ? "oversized" : "failed", message: encoded.message });
      return;
    }
    let url: string | null = null;
    try { url = exactShareUrl(options.readLocation(), encoded.value); } catch { /* Offer the exact file below. */ }
    publish({ open: true, url, revision: bound.revision, phase: url === null ? "failed" : "ready",
      message: url === null ? "An app URL is unavailable. Download exact JSON to share this chart." : message });
  }
  function cancel(): boolean {
    if (owner === null || top() !== owner) return false;
    const popped = composition.replacementWorkflow.applyLifecycleIntent({ kind: "pop-dialog", dialogId: DIALOG_ID });
    if (!popped.ok) return false;
    owner = null; bound = null;
    publish({ open: false, url: null, message: null });
    return true;
  }
  composition.controller.subscribe(() => {
    if (owner === null) return;
    if (!composition.readApplicationState().dialogs.includes(owner)) {
      owner = null; bound = null; publish({ open: false, url: null, message: null });
    }
    // A changed preview remains visibly bound to its old revision until Copy.
    // The first click refreshes and refuses delivery; the next is fresh consent.
  });
  return Object.freeze({
    getSnapshot: () => view,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    open: () => {
      if (owner !== null) return;
      const pushed = composition.replacementWorkflow.applyLifecycleIntent({ kind: "push-dialog", dialog: {
        id: DIALOG_ID, kind: "exact-share", phase: "open", blocksHistory: false, requestId: null,
      } });
      if (!pushed.ok) { publish({ phase: "failed", message: `Share could not open (${pushed.code}). Close the current dialog and try again.` }); return; }
      owner = top() ?? null;
      prepare();
    },
    cancel,
    copy: async () => {
      if (owner === null || top() !== owner || inFlight !== null) return;
      if (!current()) { prepare("The chart changed. Review the refreshed link, then choose Copy exact link again."); return; }
      if (view.url === null) return;
      const selectedOwner = owner, selectedBound = bound, url = view.url;
      const attempt = {}; inFlight = attempt; publish({ message: "Copying exact link…" });
      let copied = false;
      try { await options.writeClipboard(url); copied = true; } catch { /* The selectable URL remains available. */ }
      finally { if (inFlight === attempt) inFlight = null; }
      if (owner !== selectedOwner || top() !== selectedOwner) { publish({}); return; }
      if (bound !== selectedBound || !current()) {
        prepare("The chart changed while copying. The clipboard may contain the previous chart; review this link and copy again.");
        return;
      }
      publish({ phase: copied ? "copied" : "ready", message: copied ? "Exact link copied."
        : "Clipboard access was unavailable. Select and copy the exact link below, or download exact JSON." });
    },
    downloadJson: () => {
      if (owner === null || top() !== owner) return;
      if (cancel()) void options.lifecycle.openExport();
    },
  });
}
