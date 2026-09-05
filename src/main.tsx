import { render } from "preact";

import {
  applySharedStartup,
  createStudioAudio,
  createStudioComposition,
  createStudioMidiImport,
  createStudioRecoveryOrchestrator,
  createStudioRecoverySession,
  createStudioRecoveryStatusFeed,
  createStudioLifecycle,
  createStudioDocumentImport,
  createStudioLocalReplacement,
  createX1SerializedTransportRetirementAdapter,
  applicationHistoryRetainedByteEstimator,
  validateDocumentSemantics,
  decodeShareFragment,
  seedStarterChart,
} from "./application/runtime";
import { decodeDocumentShape } from "./domain";
import { startPreparedExportDelivery } from "./export";
import {
  createIndexedDbRecoveryAdapter,
  createLocalStorageRecoveryAdapter,
  createRecoveryService,
  createStudioRecoveryStorage,
} from "./persistence";
import {
  createBrowserAudioPlatform,
  loadSmfWasmDecoder,
} from "./audio/runtime";
import {
  createMidiExportDownloadStart,
  initializeTheme,
  StudioRoot,
  StudioStartupFailure,
} from "./ui/runtime";

/*
 * The paper theme is the stylesheet base and the OS preference governs until
 * the user chooses; a remembered explicit choice is pinned before the first
 * paint so the page never flashes the wrong theme.
 */
initializeTheme();

const mountPoint = document.querySelector<HTMLElement>("#app");

if (mountPoint === null) {
  throw new Error("JazzChords.org could not find its application mount point.");
}

/*
 * Preact renders BESIDE pre-existing static children, it does not replace
 * them: without this, the "Opening the local studio…" placeholder survives
 * below the shell forever as a dead 24vh scroll zone that phones can
 * rubber-band into. The placeholder's job ends the moment scripts run.
 */
mountPoint.replaceChildren();

/*
 * The composition root owns adapter choice. The audio stack is built here, not
 * inside the application layer, so the layer that orchestrates playback never
 * reaches for a browser API and stays compilable headless. No `AudioContext`
 * work happens until the first Play carries a trusted gesture receipt.
 */
const audio = createStudioAudio(createBrowserAudioPlatform());

/*
 * The MIDI import decoder is the same discipline: the embedded wasm module's
 * host lives in the audio layer because the release contract pins wasm
 * payloads there, and the application layer receives it as an injected
 * function. It is loaded lazily on the first import gesture, so a session that
 * never imports a file pays nothing for it.
 */
const midiImport = createStudioMidiImport(loadSmfWasmDecoder);

/*
 * The composition root also owns the A0/E0 interchange owner aggregate the
 * controller closure constructs beside itself (`composition.interchangeOwner`).
 * The recovery and lifecycle services receive that authority here; UI receives
 * only their typed views and gestures, never the owner aggregate.
 */
const creation = createStudioComposition({
  audio,
  nowMs: () => performance.now(),
  /*
   * U7's two composition-edge adapters: Web Crypto for the artifact digest
   * and the browser download adapter. Both live here so the application layer
   * never reaches for a browser API.
   */
  midiExportHashBytes: async (bytes) => {
    const subtle =
      typeof globalThis.crypto === "undefined"
        ? undefined
        : globalThis.crypto.subtle;
    if (subtle === undefined) {
      throw new Error("U7_HASH_PORT_UNAVAILABLE");
    }
    const digest = await subtle.digest("SHA-256", bytes as BufferSource);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  },
  midiExportDelivery: createMidiExportDownloadStart({
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => {
      URL.revokeObjectURL(url);
    },
    createAnchor: () => document.createElement("a"),
    attachToDocument: (anchor) => {
      /* The shim is structural so tests can stub it; this composition only
       * ever receives the real HTMLAnchorElement it created above, and
       * Firefox only downloads attached anchors. instanceof narrows without
       * an escape cast. */
      if (anchor instanceof HTMLAnchorElement) document.body.append(anchor);
    },
  }),
});

if (creation.ok) {
  /*
   * A `#zdoc=` fragment is a shared chart: decode it through the bounded
   * total decoder and apply it through the exact typed command path a user
   * travels. A refused share falls back to the reviewed starter chart with
   * the refusal surfaced, never a half-applied document. With no share
   * present, a pristine first open receives the starter chart (jcpe-b20t).
   * Seeding happens before the first render so the opening paint already
   * shows a playable progression.
   */
  const composition = creation.composition;
  const { controller, midiExport } = composition;
  let startupNotice: string | null = null;
  const shared = decodeShareFragment(window.location.hash);
  if (shared.ok) {
    const applied = applySharedStartup(controller, shared.value);
    if (!applied.applied) {
      startupNotice = `The shared chart was not opened: ${applied.reason}`;
      seedStarterChart(controller);
    }
  } else if (shared.code !== "share.fragment_absent") {
    startupNotice = `The share link could not be read: ${shared.message}`;
    seedStarterChart(controller);
  } else {
    seedStarterChart(controller);
  }
  /*
   * A1 recovery wiring (l3a.2): the service over the real browser
   * adapters (IndexedDB primary, localStorage fallback), the mutation
   * feed on the controller, best-effort flush on visibilitychange, and
   * the Keep/Discard startup surface. Every session that reaches this
   * point has already edited (the share apply or the starter seed ran
   * real commands), so the reviewed matrix downgrades auto-open to the
   * Keep/Discard offer — recovery never silently overwrites work.
   * Keep rides the transactional replacement channel over the sealed
   * owner ports and the REAL serialized-transport X1 retirement; a
   * refused Keep changes nothing. Browser recovery is never called Save.
   */
  const recoveryStatus = createStudioRecoveryStatusFeed();
  const recoveryStorage = createStudioRecoveryStorage([
    createIndexedDbRecoveryAdapter(), createLocalStorageRecoveryAdapter(),
  ]);
  const recoveryService = createRecoveryService({
    adapters: recoveryStorage.adapters,
    clock: {
      nowMs: () => performance.now(),
      nowIso: () => new Date().toISOString(),
      setTimeout: (callback, delayMs) =>
        window.setTimeout(callback, delayMs),
      clearTimeout: (handle) => {
        window.clearTimeout(handle);
      },
    },
  }, recoveryStatus.observe);
  let recoverySeedOrdinal = 0;
  const replacementRetirement = createX1SerializedTransportRetirementAdapter(
    audio.transportService, composition.allocateTransportCommandRequestId, {
      beforeSubmit: composition.replacementWorkflow.expectTransportRetirement,
      settled: composition.replacementWorkflow.settleTransportRetirement,
    },
  );
  const recoveryOrchestrator = createStudioRecoveryOrchestrator({
    composition,
    recovery: recoveryService,
    resolveStartupDocumentId: recoveryStorage.resolveStartupDocumentId,
    retirement: replacementRetirement,
    decodeDocumentShape,
    validateDocumentSemantics,
    readState: composition.readApplicationState,
    estimateHistoryRetainedBytes: applicationHistoryRetainedByteEstimator,
    nowMs: () => performance.now(),
    allocateCommandSeedId: () => {
      recoverySeedOrdinal += 1;
      return `recovery-keep-${String(recoverySeedOrdinal)}`;
    },
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void recoveryOrchestrator.flush();
    }
  });
  const recoveryBinding = createStudioRecoverySession({
    subscribeRecovery: recoveryStatus.subscribe,
    composition,
    orchestrator: recoveryOrchestrator,
    sessionEdited: true,
    formatTimestamp: (timestamp) => {
      const parsed = Date.parse(timestamp);
      return Number.isNaN(parsed) ? timestamp : new Date(parsed).toLocaleString();
    },
  });

  const lifecycle = createStudioLifecycle({
    composition,
    recovery: recoveryService,
    startDelivery: startPreparedExportDelivery,
    nowIso: () => new Date().toISOString(),
    hashBytes: async (bytes) => {
      const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    },
  });

  const documentImport = createStudioDocumentImport({
    composition,
    recovery: recoveryService,
    retirement: replacementRetirement,
    exportCurrent: () => { void lifecycle.openExport(); },
  });

  const localReplacement = createStudioLocalReplacement({
    composition, recovery: recoveryService, retirement: replacementRetirement,
    exportCurrent: () => { void lifecycle.openExport(); },
  });

  render(
    <StudioRoot
      controller={controller}
      midiExport={midiExport}
      midiImport={midiImport}
      startupNotice={startupNotice}
      recovery={recoveryBinding}
      lifecycle={lifecycle}
      documentImport={documentImport}
      localReplacement={localReplacement}
    />,
    mountPoint,
  );
} else {
  render(
    <StudioStartupFailure
      message={creation.refusal.message}
      recoveryAction={creation.refusal.recoveryAction}
    />,
    mountPoint,
  );
}
