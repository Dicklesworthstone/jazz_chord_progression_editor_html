import { h, render } from "preact";

import {
  createStudioAudio,
  createStudioController,
  type StudioAudioPort,
} from "../application/runtime";
import type {
  AudioContextStatePort,
  AudioPlatform,
  TransportCommandOutcome,
} from "../audio";
import { createNativeAudioContextPort } from "../audio/browser-audio-platform";
import { StudioRoot } from "../ui/runtime";

/**
 * Studio audibility evidence harness.
 *
 * The X0 and X1 evidence pipelines proved the engine and the transport in real
 * browsers; what they never proved is the shipped page: the composition root's
 * own studio stack, driven through the real quick-entry field and the real Play
 * button, making actual sound. This harness renders exactly what `main.tsx`
 * renders — the same `StudioRoot` binding over a live controller and the same
 * `createStudioAudio` composition — with two deliberate differences: the
 * native `AudioContext` handed to the engine routes its destination through
 * an `AnalyserNode` tap so automation can measure output amplitude instead
 * of claiming to hear, and the first-open starter-chart seed (jcpe-b20t) is
 * not applied, because this evidence contract's typed-chart baseline and its
 * pinned digests measure the empty-studio-to-sound path.
 *
 * The tap sits outside every reviewed contract: the engine still builds its
 * persistent graph through `createNativeAudioContextPort` and still connects
 * its master chain to what it believes is the context destination. Nothing in
 * production is mocked, replaced, or rescheduled.
 */

export type StudioAudiblePhaseRecord = Readonly<{
  name: string;
  startedAtMs: number;
  endedAtMs: number | null;
  sampleCount: number;
  /** Largest absolute sample value observed at the tap during this phase. */
  maxPeak: number;
  /** Non-finite tap samples seen this phase; NaN poisoning reads as silence. */
  nonFiniteSamples?: number;
  /**
   * Audio-clock seconds at the phase boundaries. A phase whose wall time moved
   * while these stayed equal caught a stalled rendering clock — the silent-
   * output failure a state flag can never see.
   */
  contextTimeStart: number | null;
  contextTimeEnd: number | null;
}>;

export type StudioAudibleSnapshotFacts = Readonly<{
  chordCount: number;
  transportStatus: string;
  transportStatusLabel: string;
  tempoBpm: number;
}>;

/** One transport command outcome or published notification, in arrival order. */
export type StudioAudibleJournalEntry = Readonly<{
  kind: "command" | "notification";
  detail: string;
  atMs: number;
}>;

export type StudioAudibleReport = Readonly<{
  schema: "changes.evidence.studio-audible-browser.v1";
  startupOk: boolean;
  startupFailure: string | null;
  secureContext: boolean;
  contextObserved: boolean;
  contextState: string | null;
  sampleRate: number | null;
  samplingIntervalMs: number;
  phases: readonly StudioAudiblePhaseRecord[];
  snapshot: StudioAudibleSnapshotFacts | null;
  inspection: StudioAudibleInspectionFacts | null;
  journal: readonly StudioAudibleJournalEntry[];
}>;

/** The engine/transport bookkeeping the leak assertions run against. */
export type StudioAudibleInspectionFacts = Readonly<{
  engineState: string;
  contextState: string;
  persistentCreatedNodeCount: number;
  persistentEdgeCount: number;
  nonreleasingVoiceCount: number;
  retainedVoiceCount: number;
  transportState: string;
  queuedCommandCount: number;
  /** jcpe-nu6t probe: which side swallows a silent run. */
  schedulerTicks?: number;
  attackBatchesIssued?: number;
  eventsScheduled?: number;
  voicesCreated?: number;
  scheduledEventCursor?: number;
  staleCallbacksIgnored?: number;
  transportGeneration?: number;
}>;

export type StudioAudibleEvidenceApi = Readonly<{
  /** Close the current amplitude phase and open a named new one. */
  markPhase: (name: string) => void;
  snapshot: () => StudioAudibleSnapshotFacts | null;
  inspection: () => StudioAudibleInspectionFacts | null;
  report: () => StudioAudibleReport;
}>;

const SAMPLING_INTERVAL_MS = 25;

function readContextState(context: AudioContext): AudioContextStatePort {
  const state: string = context.state;
  if (
    state === "suspended" ||
    state === "running" ||
    state === "closed" ||
    state === "interrupted"
  ) {
    return state;
  }
  throw new Error("STUDIO_AUDIBLE_CONTEXT_STATE_UNSUPPORTED");
}

type MutablePhase = {
  name: string;
  startedAtMs: number;
  endedAtMs: number | null;
  sampleCount: number;
  maxPeak: number;
  nonFiniteSamples?: number;
  contextTimeStart: number | null;
  contextTimeEnd: number | null;
};

type Tap = Readonly<{
  platform: AudioPlatform;
  observedContext: () => AudioContext | null;
  observedAnalyser: () => AnalyserNode | null;
}>;

/**
 * The real browser platform with the destination routed through an analyser.
 *
 * `createNativeAudioContextPort` is the audio layer's own documented seam for
 * supplying a native context ("Test-support may supply an OfflineAudioContext
 * lifecycle at this seam"). The facade below is the live `AudioContext` in
 * every respect except `destination`, which is an `AnalyserNode` connected to
 * the true destination — an inaudible pass-through the harness can read.
 */
function createTappedBrowserPlatform(): Tap {
  let observedContext: AudioContext | null = null;
  let observedAnalyser: AnalyserNode | null = null;

  const platform: AudioPlatform = Object.freeze({
    createContext(options) {
      if (typeof globalThis.AudioContext !== "function") {
        throw new Error("STUDIO_AUDIBLE_CONTEXT_UNAVAILABLE");
      }
      const context = new globalThis.AudioContext({
        latencyHint: options.latencyHint,
      });
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.connect(context.destination);
      observedContext = context;
      observedAnalyser = analyser;

      /*
       * Shadow this one instance's `destination` with the analyser so the
       * engine's master chain connects through the tap on its way to the real
       * output. An own-property accessor legally shadows the prototype
       * accessor; every other member of the context is untouched, and no type
       * is asserted away.
       */
      Object.defineProperty(context, "destination", {
        configurable: true,
        get: () => analyser,
      });

      return createNativeAudioContextPort(context, {
        state: () => readContextState(context),
        setStateHandler: (handler) => {
          context.onstatechange = handler;
        },
        resume: () => context.resume(),
        close: () => context.close(),
      });
    },
  });

  return Object.freeze({
    platform,
    observedContext: () => observedContext,
    observedAnalyser: () => observedAnalyser,
  });
}

function bootHarness(): StudioAudibleEvidenceApi {
  const tap = createTappedBrowserPlatform();
  const contextTime = (): number | null => {
    const context = tap.observedContext();
    return context === null ? null : context.currentTime;
  };
  const phases: MutablePhase[] = [
    {
      name: "boot",
      startedAtMs: performance.now(),
      endedAtMs: null,
      sampleCount: 0,
      maxPeak: 0,
      contextTimeStart: null,
      contextTimeEnd: null,
    },
  ];
  let startupFailure: string | null = null;
  let snapshotReader: (() => StudioAudibleSnapshotFacts) | null = null;
  let inspectionReader: (() => StudioAudibleInspectionFacts) | null = null;
  const journal: StudioAudibleJournalEntry[] = [];
  const journalCommand = (
    name: string,
    outcome: TransportCommandOutcome,
  ): TransportCommandOutcome => {
    journal.push(
      Object.freeze({
        kind: "command" as const,
        detail:
          outcome.termination === "refusal"
            ? `${name}#${String(outcome.commandRequestId)}:refusal:${outcome.code}:${String(outcome.engineRefusalCode)}:state=${outcome.state}`
            : `${name}#${String(outcome.commandRequestId)}:receipt:${outcome.stateAfter}`,
        atMs: performance.now(),
      }),
    );
    return outcome;
  };

  const mount = document.querySelector<HTMLElement>("#app");
  if (mount === null) {
    startupFailure = "STUDIO_AUDIBLE_MOUNT_MISSING";
  } else {
    const realPort = createStudioAudio(tap.platform);
    realPort.subscribe((notification) => {
      journal.push(
        Object.freeze({
          kind: "notification" as const,
          detail: `#${String(notification.commandRequestId)}:${notification.status}:seq=${String(notification.notificationSequence)}:gen=${String(notification.generation)}:fail=${String(notification.failureCode)}`,
          atMs: performance.now(),
        }),
      );
    });
    /**
     * The journaling port is the real port with every outcome recorded on the
     * way through — pure observation, no behavior of its own.
     */
    const audio: StudioAudioPort = Object.freeze({
      initialize: async (
        commandRequestId,
        gesture,
        documentId,
        planRevision,
        initialMix,
      ) =>
        journalCommand(
          "initialize",
          await realPort.initialize(
            commandRequestId,
            gesture,
            documentId,
            planRevision,
            initialMix,
          ),
        ),
      play: async (commandRequestId, binding, startBeat) =>
        journalCommand(
          "play",
          await realPort.play(commandRequestId, binding, startBeat),
        ),
      pause: async (commandRequestId) =>
        journalCommand("pause", await realPort.pause(commandRequestId)),
      resume: async (commandRequestId, gesture) =>
        journalCommand(
          "resume",
          await realPort.resume(commandRequestId, gesture),
        ),
      stop: async (commandRequestId) =>
        journalCommand("stop", await realPort.stop(commandRequestId)),
      setInstrument: async (commandRequestId, instrumentId) =>
        journalCommand(
          "set-instrument",
          await realPort.setInstrument(commandRequestId, instrumentId),
        ),
      prepareInstrument: realPort.prepareInstrument,
      startPreview: realPort.startPreview,
      readAnalysisFrame: realPort.readAnalysisFrame,
      subscribe: realPort.subscribe,
      isInitialized: realPort.isInitialized,
      readPlayheadBeat: realPort.readPlayheadBeat,
      inspect: realPort.inspect,
    });
    inspectionReader = () => {
      const inspection = realPort.inspect();
      return Object.freeze({
        engineState: inspection.engine.state,
        contextState: inspection.engine.contextState,
        persistentCreatedNodeCount: inspection.engine.persistentCreatedNodeCount,
        persistentEdgeCount: inspection.engine.persistentEdgeCount,
        nonreleasingVoiceCount: inspection.engine.nonreleasingVoiceCount,
        retainedVoiceCount: inspection.engine.retainedVoiceCount,
        transportState: inspection.transport.state,
        queuedCommandCount: inspection.transport.queuedCommandCount,
        schedulerTicks: inspection.transport.work.schedulerTicks,
        attackBatchesIssued: inspection.transport.work.attackBatchesIssued,
        eventsScheduled: inspection.transport.work.eventsScheduled,
        voicesCreated: inspection.engine.work.voicesCreated,
        scheduledEventCursor: inspection.transport.scheduledEventCursor,
        staleCallbacksIgnored: inspection.transport.work.staleCallbacksIgnored,
        transportGeneration: inspection.transport.generation,
      });
    };
    const creation = createStudioController({
      audio,
      nowMs: () => performance.now(),
    });
    if (creation.ok) {
      const controller = creation.controller;
      snapshotReader = () => {
        const snapshot = controller.getSnapshot();
        return Object.freeze({
          chordCount: snapshot.chordCount,
          transportStatus: snapshot.transport.status,
          transportStatusLabel: snapshot.transport.statusLabel,
          tempoBpm: snapshot.tempoBpm,
        });
      };
      render(h(StudioRoot, { controller }), mount);
    } else {
      startupFailure = `startup-refusal:${creation.refusal.message}`;
    }
  }

  const sampleBuffer = new Float32Array(2048);
  globalThis.setInterval(() => {
    const analyser = tap.observedAnalyser();
    const phase = phases[phases.length - 1];
    if (analyser === null || phase === undefined) return;
    analyser.getFloatTimeDomainData(sampleBuffer);
    let peak = 0;
    let nonFinite = 0;
    for (const value of sampleBuffer) {
      if (!Number.isFinite(value)) {
        nonFinite += 1;
        continue;
      }
      const magnitude = Math.abs(value);
      if (magnitude > peak) peak = magnitude;
    }
    phase.sampleCount += 1;
    if (peak > phase.maxPeak) phase.maxPeak = peak;
    /* NaN poisoning reads as exact silence without this witness. */
    phase.nonFiniteSamples = (phase.nonFiniteSamples ?? 0) + nonFinite;
  }, SAMPLING_INTERVAL_MS);

  return Object.freeze({
    markPhase: (name: string) => {
      const now = performance.now();
      const boundaryContextTime = contextTime();
      const current = phases[phases.length - 1];
      if (current !== undefined) {
        current.endedAtMs = now;
        current.contextTimeEnd = boundaryContextTime;
      }
      phases.push({
        name,
        startedAtMs: now,
        endedAtMs: null,
        sampleCount: 0,
        maxPeak: 0,
        contextTimeStart: boundaryContextTime,
        contextTimeEnd: null,
      });
    },
    snapshot: () => (snapshotReader === null ? null : snapshotReader()),
    inspection: () => (inspectionReader === null ? null : inspectionReader()),
    report: () => {
      const context = tap.observedContext();
      return Object.freeze({
        schema: "changes.evidence.studio-audible-browser.v1" as const,
        startupOk: startupFailure === null,
        startupFailure,
        secureContext: globalThis.isSecureContext,
        contextObserved: context !== null,
        contextState: context === null ? null : context.state,
        sampleRate: context === null ? null : context.sampleRate,
        samplingIntervalMs: SAMPLING_INTERVAL_MS,
        phases: phases.map((phase) => Object.freeze({ ...phase })),
        snapshot: snapshotReader === null ? null : snapshotReader(),
        inspection: inspectionReader === null ? null : inspectionReader(),
        journal: [...journal],
      });
    },
  });
}

declare global {
  var __JCPE_STUDIO_AUDIBLE_EVIDENCE__: StudioAudibleEvidenceApi | undefined;
}

globalThis.__JCPE_STUDIO_AUDIBLE_EVIDENCE__ = bootHarness();
document.documentElement.dataset["studioAudibleReady"] = "true";
