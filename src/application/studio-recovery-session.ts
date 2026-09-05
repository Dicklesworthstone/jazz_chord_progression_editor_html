import type { DocumentId } from "../domain";
import {
  RECOVERY_STATUS_VOCABULARY,
  type RecoverySnapshot,
} from "../persistence";
import type { StudioComposition } from "./studio-controller";
import type {
  StudioRecoveryOrchestrator,
  StudioRecoveryStartupView,
} from "./studio-recovery";

export type StudioRecoverySessionView = Readonly<{
  offer: Readonly<{
    savedAtLabel: string;
    revision: number;
    previous: boolean;
  }> | null;
  busy: boolean;
  failureMessage: string | null;
  statusText: string | null;
  diagnosticCode: string | null;
  diagnosticText: string | null;
  exportText: string | null;
}>;

/** The UI holds gestures and text only; the recovery envelope stays private. */
export type StudioRecoverySession = Readonly<{
  getSnapshot: () => StudioRecoverySessionView;
  subscribe: (listener: () => void) => () => void;
  start: () => Promise<void>;
  keep: () => Promise<void>;
  discard: () => Promise<void>;
}>;

type RecoveryStatusListener = (snapshot: RecoverySnapshot, savedAt: string | null) => void;

/** Composition-edge observation, separate from A1's frozen operation surface. */
export function createStudioRecoveryStatusFeed() {
  const listeners = new Set<RecoveryStatusListener>();
  let latest: Readonly<{ snapshot: RecoverySnapshot; savedAt: string | null }> | null = null;
  return Object.freeze({
    observe: (snapshot: RecoverySnapshot, savedAt: string | null): void => {
      latest = { snapshot, savedAt };
      for (const listener of listeners) listener(snapshot, savedAt);
    },
    subscribe: (listener: RecoveryStatusListener): (() => void) => {
      listeners.add(listener);
      if (latest !== null) listener(latest.snapshot, latest.savedAt);
      return () => { listeners.delete(listener); };
    },
  });
}

export function createStudioRecoverySession(options: Readonly<{
  composition: StudioComposition;
  subscribeRecovery: (listener: RecoveryStatusListener) => () => void;
  orchestrator: StudioRecoveryOrchestrator;
  sessionEdited: boolean;
  formatTimestamp: (timestamp: string) => string;
}>): StudioRecoverySession {
  const { composition, orchestrator } = options;
  let snapshot: StudioRecoverySessionView = Object.freeze({
    offer: null,
    busy: false,
    failureMessage: null,
    statusText: null,
    diagnosticCode: null,
    diagnosticText: null,
    exportText: null,
  });
  const listeners = new Set<() => void>();
  let offered: Extract<StudioRecoveryStartupView, { kind: "offer" }> | null = null;
  let offeredAt: Readonly<{ documentId: DocumentId; revision: number }> | null = null;
  let storageDocumentId: DocumentId | null = null;
  let started: Promise<void> | null = null;
  let feedAttached = false;

  function publish(patch: Partial<StudioRecoverySessionView>): void {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    for (const listener of listeners) listener();
  }

  function attachFeed(noteInitial: boolean): void {
    if (feedAttached) return;
    feedAttached = true;
    orchestrator.attachMutationFeed({ noteInitial });
  }

  options.subscribeRecovery((status, savedAt) => {
    let statusText: string | null = null;
    if (status.pendingRevision !== null) {
      statusText = RECOVERY_STATUS_VOCABULARY.changesPending;
    } else if (status.lastRefusal !== null) {
      statusText = RECOVERY_STATUS_VOCABULARY.unavailable;
    } else if (status.cleanRevision !== null && savedAt !== null) {
      statusText = RECOVERY_STATUS_VOCABULARY.recoveredLocally.replace(
        "{time}", options.formatTimestamp(savedAt),
      );
    }
    publish({ statusText, diagnosticCode: status.lastRefusal,
      diagnosticText: status.lastRefusal === null ? null
        : `${RECOVERY_STATUS_VOCABULARY.unavailable} (${status.lastRefusal}). Use Export JSON to keep a portable copy.`,
    });
  });
  composition.controller.subscribe(() => {
    const state = composition.readApplicationState();
    publish({
      exportText: state.exportRevision === null ? null
        : state.exportRevision === state.revision
          ? RECOVERY_STATUS_VOCABULARY.exportedAtRevision.replace("{revision}", String(state.exportRevision))
          : RECOVERY_STATUS_VOCABULARY.changedSinceExport,
    });
  });

  const keep = async (): Promise<void> => {
    if (snapshot.busy || offered === null || offeredAt === null) return;
    const state = composition.readApplicationState();
    if (state.document.id !== offeredAt.documentId || state.revision !== offeredAt.revision) {
      publish({ failureMessage: "The chart changed after recovery was offered (command.stale_revision). Your edits are unchanged; discard the offered copy to continue with this chart." });
      return;
    }
    publish({ busy: true, failureMessage: null });
    try {
      const result = await orchestrator.keep(offered.envelope);
      if (!result.ok) {
        publish({ failureMessage: `The recovered chart could not be opened (${result.code}). The current chart is unchanged.` });
        return;
      }
      offered = null;
      offeredAt = null;
      publish({ offer: null });
      attachFeed(true);
    } catch {
      publish({ failureMessage: "The recovered chart could not be opened (recovery.keep_failed). The current chart is unchanged. Try again." });
    } finally {
      publish({ busy: false });
    }
  };

  async function start(): Promise<void> {
    if (started !== null) {
      await started;
      return;
    }
    started = (async () => {
      const initial = composition.readApplicationState();
      storageDocumentId = initial.document.id;
      try {
        // No write is scheduled until both copies have been read and the
        // offered chart is accepted/discarded. A slow probe is never a cutoff.
        const view = await orchestrator.startup({ sessionEdited: options.sessionEdited });
        if (view.kind === "offer") {
          const rejected = view.rejectedCandidates[0];
          if (rejected !== undefined) publish({ diagnosticCode: rejected.code,
            diagnosticText: `The ${rejected.slot} recovery copy did not pass document validation (${rejected.code}). Keep the offered previous copy, or discard local recovery.`,
          });
          offered = view;
          storageDocumentId = view.storageDocumentId;
          const current = composition.readApplicationState();
          offeredAt = { documentId: current.document.id, revision: current.revision };
          publish({ offer: Object.freeze({
            savedAtLabel: options.formatTimestamp(view.savedAt),
            revision: view.revision,
            previous: view.disposition === "offer-previous",
          }) });
          if (view.disposition === "open-current-automatically" &&
              current.document.id === initial.document.id && current.revision === initial.revision) {
            await keep();
          }
          return;
        }
        if (view.kind === "report-unrecoverable") {
          const code = view.rejectedCandidates[0]?.code ?? "recovery.corrupt_envelope";
          publish({ failureMessage: `Neither local recovery copy could be opened (${code}). Your current chart is unchanged. Export JSON to keep a portable copy.` });
        }
        // Do not save the demonstration chart merely because the page loaded.
        // An edit made while the read was pending must still be recovered.
        const current = composition.readApplicationState();
        attachFeed(current.document.id !== initial.document.id || current.revision !== initial.revision);
      } catch {
        publish({ statusText: RECOVERY_STATUS_VOCABULARY.unavailable,
          diagnosticCode: "recovery.probe_failed",
          diagnosticText: "recovery.probe_failed: Use Export JSON to keep a portable copy." });
        attachFeed(false);
      }
    })();
    await started;
  }

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    start,
    keep,
    discard: async () => {
      if (snapshot.busy || offered === null || storageDocumentId === null) return;
      publish({ busy: true, failureMessage: null });
      try {
        await orchestrator.discard(storageDocumentId);
        offered = null;
        offeredAt = null;
        publish({ offer: null });
        attachFeed(false);
      } catch {
        publish({ failureMessage: "The recovery copy could not be discarded (recovery.write_denied). The current chart is unchanged. Try Discard again." });
      } finally {
        publish({ busy: false });
      }
    },
  });
}
