import { render } from "preact";
import { useLayoutEffect, useState } from "preact/hooks";
import { decodeDocumentShape } from "../../src/domain";
import { validateDocumentSemantics } from "../../src/application/document-validation";
import { createStudioBootstrap } from "../../src/application/studio-bootstrap";
import { createStudioCompositionOverState } from "../../src/application/studio-controller";
import { createStudioAudio, createStudioLifecycle, createStudioLocalReplacement,
  createX1SerializedTransportRetirementAdapter } from "../../src/application/runtime";
import { estimateHistoryRetainedBytes } from "../../src/application/application-history";
import { MAX_HISTORY_RETAINED_BYTES } from "../../src/application/application-state-contract";
import { createBrowserAudioPlatform } from "../../src/audio/runtime";
import { createLocalStorageRecoveryAdapter, createRecoveryService } from "../../src/persistence";
import { startPreparedExportDelivery } from "../../src/export";
import { LocalReplacementDialog } from "../../src/ui/studio/LocalReplacementDialog";
import { LifecycleExportDialog } from "../../src/ui/studio/LifecycleExportDialog";
import { historyLimitDocument } from "../fixtures/history-limit";

async function boot(events: 4096 | 6144) {
  const shape = decodeDocumentShape(historyLimitDocument(events));
  if (!shape.ok) throw new Error(JSON.stringify(shape.errors));
  const published = validateDocumentSemantics(shape.value);
  if (!published.ok) throw new Error(JSON.stringify(published.errors));
  const initial = createStudioBootstrap(); if (!initial.ok) throw new Error(initial.refusal.code);
  const audio = createStudioAudio(createBrowserAudioPlatform());
  const composition = createStudioCompositionOverState({ ...initial.value.state, document: published.value },
    initial.value.dependencies, { audio, nowMs: () => performance.now() });
  const original = JSON.stringify(published.value), before = composition.readApplicationState();
  const originalRetainedBytes = estimateHistoryRetainedBytes(published.value);
  const recovery = createRecoveryService({ adapters: [createLocalStorageRecoveryAdapter()], clock: {
    nowMs: () => performance.now(), nowIso: () => new Date().toISOString(),
    setTimeout: (callback, delay) => window.setTimeout(callback, delay), clearTimeout: handle => { window.clearTimeout(handle); },
  } });
  const capability = await recovery.probeRecoveryCapability();
  const retirement = createX1SerializedTransportRetirementAdapter(audio.transportService,
    composition.allocateTransportCommandRequestId, { beforeSubmit: composition.replacementWorkflow.expectTransportRetirement,
      settled: composition.replacementWorkflow.settleTransportRetirement });
  const lifecycle = createStudioLifecycle({ composition, recovery, startDelivery: startPreparedExportDelivery,
    nowIso: () => new Date().toISOString(), hashBytes: async bytes => {
      const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    } });
  const service = createStudioLocalReplacement({ composition, retirement, recovery,
    exportCurrent: () => { void lifecycle.openExport(); } });
  function Host() {
    const [replacementView, setReplacement] = useState(service.getSnapshot);
    const [exportView, setExport] = useState(lifecycle.getSnapshot);
    useLayoutEffect(() => service.subscribe(() => { setReplacement(service.getSnapshot()); }), []);
    useLayoutEffect(() => lifecycle.subscribe(() => { setExport(lifecycle.getSnapshot()); }), []);
    return <>
      <main id="studio-shell-background">
        <div id="workspace" tabIndex={-1}>
          <input id="studio-document-title" aria-label="Chart title" value="Keep every unison" readOnly />
          <button id="studio-new-chart" onClick={() => { void service.requestNew(); }}>New chart</button>
          <button id="studio-export-json" onClick={() => { void lifecycle.openExport(); }}>Export JSON</button>
          <button id="history-undo" onClick={() => { composition.controller.undo(); }}>Undo</button>
        </div>
      </main>
      <LocalReplacementDialog service={service} view={replacementView} />
      <LifecycleExportDialog service={lifecycle} view={exportView} />
    </>;
  }
  render(<Host />, document.body);
  return () => {
    const state = composition.readApplicationState();
    return { originalRetainedBytes, cap: MAX_HISTORY_RETAINED_BYTES, capability,
      exactOriginal: JSON.stringify(state.document) === original,
      originalObject: state.document === before.document, originalHistory: state.history === before.history,
      originalBookmarks: state.bookmarks === before.bookmarks, originalExport: state.exportRevision === before.exportRevision,
      revision: state.revision, title: state.document.title, undoCount: state.history.undo.length,
      transition: state.documentTransition.kind, dialogs: state.dialogs.map(dialog => dialog.kind),
      initialized: audio.isInitialized(),
    };
  };
}

declare global {
  interface Window {
    u5HistoryLimit: { boot: (events: 4096 | 6144) => Promise<void>; read: Awaited<ReturnType<typeof boot>> };
  }
}
// Only the host is reduced: real production dialogs, A0/F2/F3/X1, history
// estimator, native storage and download adapters remain in the execution path.
// Rendering thousands of chart cards is outside this boundary-specific proof.
window.u5HistoryLimit = { boot: async events => { window.u5HistoryLimit.read = await boot(events); },
  read: () => { throw new Error("History fixture not loaded"); } };
