/**
 * The composition that makes the studio audible.
 *
 * Every part of the playback chain already existed and was proved in isolation:
 * `compilePlaybackPlan` turns a validated document into an exact tick plan,
 * `createTransportService` is the lookahead scheduler that walks that plan
 * against the audio clock, `createAudioEngine` is the synthesizer it attacks
 * and retires voices on, and `createBrowserAudioPlatform` owns the one real
 * `AudioContext`. Nothing in production constructed them, so the studio's
 * transport reported `unavailable` and the Play button was honestly disabled.
 * This module is the missing join and nothing else: it introduces no scheduling
 * policy, no musical decision, and no new refusal.
 *
 * Layer position: this is an application-owned service composition. The UI
 * dispatches an intent, the application orchestrates, and audio consumes only
 * playback plans and serialized transport commands — it never sees UI state.
 */
import {
  createAudioEngine,
  createTransportService,
  type AudioAnalysisFrame,
  type AudioEngineSnapshot,
  type AudioMix,
  type AudioPlatform,
  type AudioUserGestureReceipt,
  type TransportCommandOutcome,
  type TransportPlanBinding,
  type TransportService,
  type TransportServiceNotification,
  type TransportSnapshot,
  type TransportTimerHandle,
  type TransportTimingPolicy,
} from "../audio";
import type {
  BeatPosition,
  DocumentId,
  InstrumentId,
  MidiPitch,
} from "../domain";
import type { PlaybackPlan } from "../playback";

/**
 * A browser cannot start an audio graph without a real user gesture, so the
 * first Play is also the initialization. The receipt carries the engine's
 * required proof that a trusted event caused it.
 */
export type StudioAudioGesture = AudioUserGestureReceipt;

/**
 * Command request IDs are supplied by the application, not minted here.
 *
 * A0 installs its expectation with `expect-transport` before the command is
 * submitted and then matches the notification by request ID; if the transport
 * numbered its own commands the two would be describing different things and
 * every notification would look stale.
 */
export type StudioAudioPort = Readonly<{
  /**
   * Idempotent. The first call performs the gesture-gated initialization; later
   * calls resolve immediately so a second Play is not a second graph.
   */
  initialize: (
    commandRequestId: number,
    gesture: StudioAudioGesture,
    documentId: DocumentId,
    planRevision: number,
    /**
     * The document's playback mix. The document is the mix authority
     * (jcpe-vy6w); the module default exists only for callers with no
     * document in hand.
     */
    initialMix?: AudioMix,
  ) => Promise<TransportCommandOutcome>;
  play: (
    commandRequestId: number,
    binding: TransportPlanBinding,
    startBeat: BeatPosition,
  ) => Promise<TransportCommandOutcome>;
  pause: (commandRequestId: number) => Promise<TransportCommandOutcome>;
  resume: (
    commandRequestId: number,
    gesture: StudioAudioGesture | null,
  ) => Promise<TransportCommandOutcome>;
  stop: (commandRequestId: number) => Promise<TransportCommandOutcome>;
  /** Bind the document's instrument to the next run's scheduled attacks. */
  setInstrument: (
    commandRequestId: number,
    instrumentId: InstrumentId,
  ) => Promise<TransportCommandOutcome>;
  /**
   * Sound one chord immediately as a preview voice batch (jcpe-gnyy). The
   * preview owner is isolated from progression playback by X0/X1 law:
   * starting a new preview releases the prior one, and previews never touch
   * the playhead, plan binding, or published status.
   */
  startPreview: (
    commandRequestId: number,
    previewId: string,
    instrumentId: InstrumentId,
    midiPitches: readonly [MidiPitch, ...MidiPitch[]],
    gateSeconds: number,
  ) => Promise<TransportCommandOutcome>;
  /**
   * Warm the rendered-instrument buffer cache for the run's distinct notes.
   * Resolves false when the renderer refuses; oscillator instruments resolve
   * true without work.
   */
  prepareInstrument: (
    instrumentId: InstrumentId,
    notes: readonly Readonly<{ midiPitch: MidiPitch; velocity: number }>[],
  ) => Promise<boolean>;
  /** Every transport notification, in the order the service published them. */
  subscribe: (
    listener: (notification: TransportServiceNotification) => void,
  ) => () => void;
  isInitialized: () => boolean;
  /**
   * Display-only spectral frame from the engine's analyser tap, or null
   * outside a ready engine. The analyzer panel polls this per frame.
   */
  readAnalysisFrame: () => AudioAnalysisFrame | null;
  /**
   * Display-only live playhead beat from the transport's audio-clock anchor.
   * The UI's animation frame interpolates from this read; it never enters A0
   * state, never defines musical time, and never replaces a notification.
   */
  readPlayheadBeat: () => BeatPosition;
  /**
   * Read-only diagnostics: the engine's and transport's own inspection
   * snapshots, verbatim. Voice, node, edge, and queue counters are the leak
   * evidence the browser proofs assert on; nothing here can steer playback.
   */
  inspect: () => StudioAudioInspection;
}>;

export type StudioAudioInspection = Readonly<{
  engine: AudioEngineSnapshot;
  transport: TransportSnapshot;
}>;

/**
 * Lookahead sits mid-range in the transport's accepted 0.05–0.2 s window: long
 * enough that a busy main thread does not starve the scheduler, short enough
 * that Stop stays responsive. The tick interval is half the lookahead so every
 * scheduled horizon is visited at least twice before it elapses.
 */
export const STUDIO_TRANSPORT_TIMING: TransportTimingPolicy =
  /* @__PURE__ */ Object.freeze({
    tickIntervalMs: 50,
    lookaheadSeconds: 0.12,
    /*
     * The live audio clock advances between the scheduler's read and the
     * engine's admission read, so an attack due exactly now can arrive a
     * fraction of a millisecond in the past and be refused. The contract's
     * measured-browser margin re-issues such an attack at now + margin; it
     * can only delay an already-due attack, never silence or reorder one.
     * Measured need: WebKit refused the first attack of a run outright once
     * candidate selection made the pre-play work heavier.
     */
    immediateStartMarginSeconds: 0.01,
  });

export const STUDIO_INITIAL_MIX: AudioMix = /* @__PURE__ */ Object.freeze({
  masterVolume: 0.8,
  reverbAmount: 0.32,
});

/**
 * Bounded engine-ready wait after a receipted initialization. Twenty attempts
 * at 200 ms bounds the wait at four seconds of the activation window — the
 * same order X1's browser evidence harness needed for headless Firefox.
 */
export const ENGINE_READY_RETRY_LIMIT = 20;
export const ENGINE_READY_RETRY_INTERVAL_MS = 200;

type TimerRecord = Readonly<{ id: ReturnType<typeof setInterval> }>;

/**
 * The transport owns its own cadence, so the timer port is a thin adapter over
 * the host's interval clock. It is passed in rather than reached for so a test
 * can drive the scheduler deterministically.
 */
function browserTimerPort() {
  const handles = new Map<TransportTimerHandle, TimerRecord>();
  let nextHandle = 1;
  return Object.freeze({
    setInterval: (callback: () => void, intervalMs: number) => {
      const handle: TransportTimerHandle = nextHandle;
      nextHandle += 1;
      handles.set(handle, Object.freeze({ id: setInterval(callback, intervalMs) }));
      return handle;
    },
    clearInterval: (handle: TransportTimerHandle) => {
      const record = handles.get(handle);
      if (record === undefined) return;
      clearInterval(record.id);
      handles.delete(handle);
    },
  });
}

export type CreateStudioAudioOptions = Readonly<{
  /** Audio-clock seconds. Injected so a test can supply a deterministic clock. */
  currentTimeSeconds?: () => number;
}>;

/*
 * The platform is a parameter rather than something this module reaches for.
 * `createBrowserAudioPlatform` is a browser adapter typed against the DOM lib,
 * and the application layer is compiled headless; importing it here would drag
 * `AudioNode` and friends into a project that has no business knowing them.
 * The composition root owns adapter choice, which is also what lets a test pass
 * the offline or fake platform X0 already ships.
 */

/**
 * Build the one persistent audio graph and the transport that drives it.
 *
 * The graph is created eagerly but silent: no `AudioContext` work that a
 * browser gates behind a gesture happens until `initialize` is called with a
 * trusted receipt.
 *
 * Lifetime: the stack lives exactly as long as the page. Stop retires every
 * voice while keeping the one persistent graph (proven by the browser leak
 * evidence: node/edge counts stable across repeated play/stop cycles, zero
 * nonreleasing voices); final reclamation on navigation belongs to the
 * browser, which tears the context down with the document.
 */
export function createStudioAudio(
  basePlatform: AudioPlatform,
  options: CreateStudioAudioOptions = {},
): StudioAudioPort {
  /*
   * The engine owns its context and does not expose it, and the transport needs
   * the audio clock rather than a wall clock — scheduling against
   * `performance.now()` would drift against the sample clock the voices are
   * actually started on. The platform is an injectable port, which is the
   * intended seam: this wrapper observes the one context the engine creates and
   * reads its `currentTime`, without altering anything X0 does with it.
   */
  let contextClock: (() => number) | null = null;
  const platform = Object.freeze({
    createContext: (contextOptions: Parameters<typeof basePlatform.createContext>[0]) => {
      const context = basePlatform.createContext(contextOptions);
      contextClock = () => context.currentTime;
      return context;
    },
  });
  const engine = createAudioEngine(platform);
  const listeners = new Set<
    (notification: TransportServiceNotification) => void
  >();
  let initialized = false;

  /** Zero until the gesture-gated context exists; the transport never ticks before then. */
  const clock =
    options.currentTimeSeconds ?? (() => contextClock?.() ?? 0);

  const transport: TransportService = createTransportService(
    Object.freeze({
      engine,
      currentTimeSeconds: clock,
      timer: browserTimerPort(),
      publishNotification: (notification) => {
        for (const listener of listeners) listener(notification);
      },
    }),
  );

  const submit = async (
    commandRequestId: number,
    payload: Parameters<
      TransportService["submitTransportCommand"]
    >[0]["payload"],
  ): Promise<TransportCommandOutcome> =>
    transport.submitTransportCommand(
      Object.freeze({ commandRequestId, payload }),
    );

  /**
   * Some engines keep the context suspended after the first trusted-gesture
   * resume — X1's own browser evidence recorded this on headless Firefox and
   * intermittently on WebKit, and fixed it with a bounded resume retry inside
   * the same user activation. Without the loop the following Play refuses on a
   * not-ready engine and the studio makes no sound on those browsers.
   */
  const awaitEngineReady = async (
    gesture: StudioAudioGesture,
  ): Promise<void> => {
    let sequence = gesture.sequence;
    for (
      let attempt = 0;
      attempt < ENGINE_READY_RETRY_LIMIT &&
      engine.inspectAudioEngine().state !== "ready";
      attempt += 1
    ) {
      sequence += 1;
      await engine.resumeAudioEngine({
        gesture: Object.freeze({ ...gesture, sequence }),
      });
      if (engine.inspectAudioEngine().state === "ready") return;
      await new Promise((resolveWait) => {
        setTimeout(resolveWait, ENGINE_READY_RETRY_INTERVAL_MS);
      });
    }
  };

  return Object.freeze({
    initialize: async (
      commandRequestId,
      gesture,
      documentId,
      planRevision,
      initialMix,
    ) => {
      const outcome = await submit(
        commandRequestId,
        Object.freeze({
          kind: "initialize-transport" as const,
          gesture,
          timing: STUDIO_TRANSPORT_TIMING,
          initialMix: initialMix ?? STUDIO_INITIAL_MIX,
          documentId,
          planRevision,
        }),
      );
      /*
       * Only a receipt initializes. A refused initialization — an untrusted
       * receipt, or a browser that would not open the context — leaves no
       * graph behind, so remembering it as initialized would make every later
       * Play and preview skip the one step they need and refuse forever. The
       * flag records what happened, not what was attempted.
       */
      if (outcome.termination === "receipt") {
        await awaitEngineReady(gesture);
        initialized = true;
      }
      return outcome;
    },
    play: async (commandRequestId, binding, startBeat) =>
      submit(
        commandRequestId,
        Object.freeze({
          kind: "play" as const,
          binding,
          startBeat,
          countIn: false,
        }),
      ),
    pause: async (commandRequestId) =>
      submit(commandRequestId, Object.freeze({ kind: "pause" as const })),
    resume: async (commandRequestId, gesture) =>
      submit(
        commandRequestId,
        Object.freeze({ kind: "resume" as const, gesture }),
      ),
    stop: async (commandRequestId) =>
      submit(commandRequestId, Object.freeze({ kind: "stop" as const })),
    startPreview: async (
      commandRequestId,
      previewId,
      instrumentId,
      midiPitches,
      gateSeconds,
    ) =>
      submit(
        commandRequestId,
        Object.freeze({
          kind: "start-preview" as const,
          previewId,
          instrumentId,
          midiPitches,
          gateSeconds,
        }),
      ),
    setInstrument: async (commandRequestId, instrumentId) =>
      submit(
        commandRequestId,
        Object.freeze({ kind: "set-instrument" as const, instrumentId }),
      ),
    prepareInstrument: async (instrumentId, notes) => {
      const outcome = await engine.prepareRenderedAudioVoices({
        instrumentId,
        notes,
      });
      /*
       * One extra macrotask before the caller submits transport commands:
       * the browser gets a full event-loop turn to refresh the audio clock
       * after the render burst, so the play epoch anchors on a live reading.
       */
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      return outcome.ok;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isInitialized: () => initialized,
    readPlayheadBeat: () => transport.readDisplayPlayheadBeat(),
    readAnalysisFrame: () => {
      const outcome = engine.analyzeAudioOutput();
      return outcome.ok ? outcome.value : null;
    },
    inspect: () =>
      Object.freeze({
        engine: engine.inspectAudioEngine(),
        transport: transport.inspectTransport(),
      }),
  });
}

export type StudioPlaybackPlanBinding = Readonly<{
  plan: PlaybackPlan;
  documentId: DocumentId;
  planRevision: number;
}>;
