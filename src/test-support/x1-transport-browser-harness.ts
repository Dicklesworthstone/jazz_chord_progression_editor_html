import { createAudioEngine } from "../audio/audio-engine";
import type {
  AudioContextPort,
  AudioPlatform,
} from "../audio/audio-platform-contract";
import { createBrowserAudioPlatform } from "../audio/browser-audio-platform";
import { createTransportService } from "../audio/transport";
import type {
  TransportCommandOutcome,
  TransportCommandPayload,
  TransportServiceNotification,
  TransportSnapshot,
  TransportTimingPolicy,
} from "../audio/transport-contract";
import type { DocumentId } from "../domain";
import type { PlaybackPlan } from "../playback";

/**
 * X1 real-browser transport evidence harness.
 *
 * Bundled into one self-contained script and driven by the Playwright
 * producer spec. The trusted click handler passes its event here; the
 * harness composes the real browser audio platform, the real X0 engine,
 * and the real X1 transport, runs a short reviewed scenario against the
 * live AudioContext clock and window timers, and resolves one plain
 * serializable evidence record. Automation asserts state, node
 * bookkeeping, and console cleanliness; it does not claim to hear.
 */

export type X1TransportStepRecord = Readonly<{
  step: string;
  termination: TransportCommandOutcome["termination"];
  code: string | null;
  engineRefusalCode: string | null;
  engineStateAfter: string;
  stateAfter: string;
  generation: number;
  noFutureAttackPostcondition: boolean | null;
}>;

export type X1TransportBrowserRecord = Readonly<{
  schema: "changes.evidence.x1-transport-browser.v1";
  outcome: "completed" | "failed";
  failureDetail: string | null;
  gestureTrusted: boolean;
  gestureEventType: string;
  secureContext: boolean;
  contextObserved: boolean;
  steps: readonly X1TransportStepRecord[];
  notifications: readonly TransportServiceNotification[];
  notificationSequencesStrictlyIncreasing: boolean;
  naturalEndReached: boolean;
  naturalEndWaitMs: number;
  finalTransport: TransportSnapshot | null;
  engine: Readonly<{
    persistentCreatedNodeCount: number;
    persistentEdgeCount: number;
    nonreleasingVoiceCount: number;
    retainedVoiceCount: number;
    contextState: string;
    debugEventsDropped: number;
  }> | null;
}>;

export type X1TransportBrowserOptions = Readonly<{
  plan: PlaybackPlan;
  documentId: DocumentId;
  timing?: TransportTimingPolicy;
  naturalEndDeadlineMs?: number;
}>;

export type X1TransportBrowserHarness = Readonly<{
  beginTransportEvidence: (
    gestureEvent: Event,
    options: X1TransportBrowserOptions,
  ) => Promise<X1TransportBrowserRecord>;
}>;

const DEFAULT_TIMING: TransportTimingPolicy = Object.freeze({
  tickIntervalMs: 25,
  lookaheadSeconds: 0.1,
  immediateStartMarginSeconds: 0.015,
});

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => {
    globalThis.setTimeout(resolveWait, milliseconds);
  });
}

async function runScenario(
  gestureEvent: Event,
  options: X1TransportBrowserOptions,
): Promise<X1TransportBrowserRecord> {
  const timing = options.timing ?? DEFAULT_TIMING;
  const deadlineMs = options.naturalEndDeadlineMs ?? 20_000;
  const notifications: TransportServiceNotification[] = [];
  const steps: X1TransportStepRecord[] = [];
  const observed: { context: AudioContextPort | null } = {
    context: null,
  };
  const failure: { detail: string | null } = { detail: null };

  const browserPlatform = createBrowserAudioPlatform();
  const observingPlatform: AudioPlatform = Object.freeze({
    ...browserPlatform,
    createContext(contextOptions) {
      const port = browserPlatform.createContext(contextOptions);
      observed.context = port;
      return port;
    },
  });
  const engine = createAudioEngine(observingPlatform);
  const service = createTransportService({
    engine,
    currentTimeSeconds: () =>
      observed.context === null ? 0 : observed.context.currentTime,
    timer: Object.freeze({
      setInterval: (callback: () => void, intervalMs: number) =>
        window.setInterval(callback, intervalMs),
      clearInterval: (handle: number) => {
        window.clearInterval(handle);
      },
    }),
    publishNotification: (notification) => {
      notifications.push(notification);
    },
  });

  let requestId = 0;
  const submit = async (
    step: string,
    payload: TransportCommandPayload,
  ): Promise<TransportCommandOutcome> => {
    requestId += 1;
    const outcome = await service.submitTransportCommand({
      commandRequestId: requestId,
      payload,
    });
    steps.push(
      Object.freeze({
        step,
        termination: outcome.termination,
        code: outcome.termination === "refusal" ? outcome.code : null,
        engineRefusalCode:
          outcome.termination === "refusal" ? outcome.engineRefusalCode : null,
        engineStateAfter: engine.inspectAudioEngine().state,
        stateAfter:
          outcome.termination === "receipt"
            ? outcome.stateAfter
            : outcome.state,
        generation:
          outcome.termination === "receipt" ? outcome.generation : -1,
        noFutureAttackPostcondition:
          outcome.termination === "receipt"
            ? outcome.noFutureAttackPostcondition
            : null,
      }),
    );
    if (outcome.termination === "refusal" && failure.detail === null) {
      failure.detail = `${step}:${outcome.code}`;
    }
    return outcome;
  };

  const binding = Object.freeze({
    plan: options.plan,
    documentId: options.documentId,
    planRevision: 1,
  });
  const zeroBeat = options.plan.totalBeats.numerator === 0
    ? options.plan.totalBeats
    : options.plan.events[0]?.startBeat ?? options.plan.totalBeats;

  if (!gestureEvent.isTrusted) {
    throw new Error("X1_BROWSER_GESTURE_UNTRUSTED");
  }
  await submit("initialize-transport", {
    kind: "initialize-transport",
    gesture: {
      kind: "trusted-pointer",
      trusted: true,
      sequence: 1,
    },
    timing,
    initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
    documentId: options.documentId,
    planRevision: 0,
  });

  let gestureSequence = 1;
  let resumeAttempts = 0;
  const readyDeadline = Date.now() + 5000;
  while (
    engine.inspectAudioEngine().state !== "ready" &&
    Date.now() < readyDeadline
  ) {
    gestureSequence += 1;
    resumeAttempts += 1;
    await engine.resumeAudioEngine({
      gesture: {
        kind: "trusted-pointer",
        trusted: true,
        sequence: gestureSequence,
      },
    });
    await wait(200);
  }
  if (engine.inspectAudioEngine().state !== "ready") {
    failure.detail = `engine-not-ready-after-${String(resumeAttempts)}-resumes:${engine.inspectAudioEngine().state}`;
  }

  await submit("play", {
    kind: "play",
    binding,
    startBeat: zeroBeat,
    countIn: false,
  });

  const waitStarted = Date.now();
  let naturalEndReached = false;
  while (Date.now() - waitStarted < deadlineMs) {
    const snapshot = service.inspectTransport();
    if (snapshot.state === "ready") {
      naturalEndReached = true;
      break;
    }
    if (snapshot.state === "fault") break;
    await wait(50);
  }
  const naturalEndWaitMs = Date.now() - waitStarted;
  if (!naturalEndReached && failure.detail === null) {
    failure.detail = `natural-end-not-reached:${service.inspectTransport().state}`;
  }

  await submit("replay", {
    kind: "play",
    binding,
    startBeat: zeroBeat,
    countIn: false,
  });
  await wait(60);
  await submit("pause", { kind: "pause" });
  await submit("resume", { kind: "resume", gesture: null });
  await wait(40);
  const previewPitches = options.plan.events[0]?.midiPitches;
  if (previewPitches !== undefined) {
    await submit("start-preview", {
      kind: "start-preview",
      previewId: "x1:preview:browser",
      instrumentId: "vibraphone",
      midiPitches: previewPitches,
      gateSeconds: 0.3,
    });
    await submit("release-preview", {
      kind: "release-preview",
      previewId: "x1:preview:browser",
    });
  }
  await submit("stop", { kind: "stop" });

  const finalTransport = service.inspectTransport();
  const engineSnapshot = engine.inspectAudioEngine();

  let strictlyIncreasing = true;
  for (let index = 1; index < notifications.length; index += 1) {
    const previous = notifications[index - 1];
    const current = notifications[index];
    if (
      previous === undefined ||
      current === undefined ||
      current.notificationSequence <= previous.notificationSequence
    ) {
      strictlyIncreasing = false;
    }
  }

  return Object.freeze({
    schema: "changes.evidence.x1-transport-browser.v1",
    outcome: failure.detail === null ? "completed" : "failed",
    failureDetail: failure.detail,
    gestureTrusted: gestureEvent.isTrusted,
    gestureEventType: gestureEvent.type,
    secureContext: globalThis.isSecureContext,
    contextObserved: observed.context !== null,
    steps,
    notifications,
    notificationSequencesStrictlyIncreasing: strictlyIncreasing,
    naturalEndReached,
    naturalEndWaitMs,
    finalTransport,
    engine: Object.freeze({
      persistentCreatedNodeCount: engineSnapshot.persistentCreatedNodeCount,
      persistentEdgeCount: engineSnapshot.persistentEdgeCount,
      nonreleasingVoiceCount: engineSnapshot.nonreleasingVoiceCount,
      retainedVoiceCount: engineSnapshot.retainedVoiceCount,
      contextState: engineSnapshot.contextState,
      debugEventsDropped: engineSnapshot.debugEventsDropped,
    }),
  });
}

const harness: X1TransportBrowserHarness = Object.freeze({
  async beginTransportEvidence(gestureEvent, options) {
    try {
      return await runScenario(gestureEvent, options);
    } catch (error) {
      return Object.freeze({
        schema: "changes.evidence.x1-transport-browser.v1",
        outcome: "failed",
        failureDetail:
          error instanceof Error ? error.message : "unknown harness failure",
        gestureTrusted: gestureEvent.isTrusted,
        gestureEventType: gestureEvent.type,
        secureContext: globalThis.isSecureContext,
        contextObserved: false,
        steps: [],
        notifications: [],
        notificationSequencesStrictlyIncreasing: false,
        naturalEndReached: false,
        naturalEndWaitMs: 0,
        finalTransport: null,
        engine: null,
      });
    }
  },
});

declare global {
  var __JCPE_X1_TRANSPORT_EVIDENCE__: X1TransportBrowserHarness | undefined;
}

globalThis.__JCPE_X1_TRANSPORT_EVIDENCE__ = harness;
