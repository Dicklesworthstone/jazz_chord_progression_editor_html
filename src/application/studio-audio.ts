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
  memoizedPhysicalRealization,
  createAudioEngine,
  createTransportService,
  isPhysicalSupportedSampleRateHz,
  physicalFamilyForInstrumentId,
  physicalParameterPackSha256,
  sha256Hex,
  type AudioAnalysisFrame,
  type AudioEngineSnapshot,
  type AudioMix,
  type AudioPlatform,
  type AudioUserGestureReceipt,
  type ExpressiveVoiceGesture,
  type PhysicalRenderEvent,
  type PhysicalRenderSegment,
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
  BeatRange,
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
  /**
   * Move the playhead of an active run (jcpe-v2r-loop-seek-ukk6). The
   * transport itself refuses outside playing/paused, past the plan's end,
   * or across a stale generation; no optimistic expectation is installed —
   * the genuine notification (playing) or receipt-published pause is the
   * only thing that moves the visible playhead, so a refused seek moves
   * nothing and lies about nothing.
   */
  seek: (
    commandRequestId: number,
    targetBeat: BeatPosition,
  ) => Promise<TransportCommandOutcome>;
  /**
   * Install or clear the loop region of the active run. X1 law: the loop
   * lives in the compiled plan, so the binding handed here must be a plan
   * compiled WITH the declared loop (or without one when clearing), carrying
   * the active run's document identity; anything else is refused as a
   * mismatch rather than partially applied.
   */
  setLoop: (
    commandRequestId: number,
    binding: TransportPlanBinding,
    loop: BeatRange | null,
  ) => Promise<TransportCommandOutcome>;
  /**
   * Rebind the active run to a newly performed plan mid-flight
   * (jcpe-7ftl live groove switch). X1 law mirrors set-tempo: same
   * documentId, strictly greater planRevision; the swap lands at the next
   * unstarted event and sounding voices finish on the old groove.
   */
  setPerformance: (
    commandRequestId: number,
    binding: TransportPlanBinding,
  ) => Promise<TransportCommandOutcome>;
  /**
   * Ride the live mix (jcpe-v2r-live-mix-btb4): the engine ramps its master
   * gain without touching the schedule, so a fader drag is audible during
   * playback. Not a generation boundary; refused whole when the transport
   * cannot accept commands.
   */
  setMix: (
    commandRequestId: number,
    mix: AudioMix,
  ) => Promise<TransportCommandOutcome>;
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
    notes: readonly Readonly<{
      midiPitch: MidiPitch;
      velocity: number;
      /** Scheduled gate seconds; warms the exact attack-time bucket. */
      gateSeconds?: number;
      eventId?: string;
      voiceOrdinal?: number;
    }>[],
    binding?: TransportPlanBinding,
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
  /**
   * Composition-private raw serialized transport (l3a.2 X1 binding: the
   * replacement-retirement adapter submits replace-plan through the same
   * FIFO). The command-ID law is app-wide strictly increasing, so every
   * submitter must draw from the composition's single allocator.
   */
  transportService: TransportService;
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

/**
 * The mix the graph is initialized with, before any document's own playback
 * settings reach it. `reverbAmount` matches the seeded document's 0.18 (see
 * `STUDIO_BLANK_DOCUMENT_CANDIDATE` in `studio-bootstrap.ts`) so the first
 * sound a visitor hears is the balance the style was tuned at: the hall is
 * about four seconds long, and the tuned ballad style's short, released notes
 * would otherwise be joined back together by its tail.
 */
export const STUDIO_INITIAL_MIX: AudioMix = /* @__PURE__ */ Object.freeze({
  masterVolume: 1,
  reverbAmount: 0.55,
});

/**
 * Bounded engine-ready wait after a receipted initialization. Twenty attempts
 * at 200 ms bounds the wait at four seconds of the activation window — the
 * same order X1's browser evidence harness needed for headless Firefox.
 */
export const ENGINE_READY_RETRY_LIMIT = 20;
export const ENGINE_READY_RETRY_INTERVAL_MS = 200;

/**
 * One genuine UI activation reserves its own sequence plus every bounded
 * engine-resume retry that activation may issue. Advancing UI gestures by this
 * stride prevents a later click from replaying a sequence consumed by an
 * earlier activation's retry loop.
 */
export const STUDIO_AUDIO_GESTURE_SEQUENCE_STRIDE =
  ENGINE_READY_RETRY_LIMIT + 1;

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

type PhysicalPreparationNoteIdentity = Readonly<{
  eventId?: string;
  voiceOrdinal?: number;
}>;

export type PhysicalPhrasePreparationEntry = Readonly<{
  segment: PhysicalRenderSegment;
  event: PhysicalRenderEvent;
}>;

export type PhysicalPhrasePreparationNote = Readonly<{
  midiPitch: MidiPitch;
  velocity: number;
  physicalGesture: ExpressiveVoiceGesture;
  physicalFrameCount: number;
  physicalCacheFingerprint: string;
  physicalStateReset: boolean;
}>;

/**
 * Select the smallest state-continuous phrase prefix needed by one warmup.
 *
 * A Play request deliberately warms only a bounded prefix of chart events.
 * The old composition ignored that request for clarinet and rendered every
 * segment in the entire bound plan before first audio.  Stateful wind work
 * cannot simply filter to the named events, though: a later legato segment
 * needs every earlier segment for the same retained voice.  This selector
 * therefore finds the last requested position per physical voice and returns
 * exactly that voice's prefix, in render-plan order.
 */
export function selectPhysicalPhrasePreparationEntries(
  notes: readonly PhysicalPreparationNoteIdentity[],
  gestures: readonly ExpressiveVoiceGesture[],
  segments: readonly PhysicalRenderSegment[],
): readonly PhysicalPhrasePreparationEntry[] {
  const gesturesByEvent = new Map<string, ExpressiveVoiceGesture[]>();
  for (const gesture of gestures) {
    const eventGestures = gesturesByEvent.get(gesture.eventId) ?? [];
    eventGestures.push(gesture);
    gesturesByEvent.set(gesture.eventId, eventGestures);
  }
  const requestedGestureKeys = new Set<string>();
  for (const note of notes) {
    if (note.eventId === undefined || note.voiceOrdinal === undefined) continue;
    const gesture = gesturesByEvent.get(note.eventId)?.[note.voiceOrdinal];
    if (gesture === undefined) continue;
    requestedGestureKeys.add(`${gesture.eventId}\u001f${gesture.voiceId}`);
  }

  const lastRequestedByVoice = new Map<string, number>();
  const seenByVoice = new Map<string, number>();
  for (const segment of segments) {
    for (const event of segment.events) {
      const position = seenByVoice.get(event.voiceId) ?? 0;
      seenByVoice.set(event.voiceId, position + 1);
      const gesture = gestures[event.gestureIndex];
      if (
        gesture !== undefined &&
        requestedGestureKeys.has(`${gesture.eventId}\u001f${gesture.voiceId}`)
      ) {
        lastRequestedByVoice.set(event.voiceId, position);
      }
    }
  }

  const selected: PhysicalPhrasePreparationEntry[] = [];
  seenByVoice.clear();
  for (const segment of segments) {
    for (const event of segment.events) {
      const position = seenByVoice.get(event.voiceId) ?? 0;
      seenByVoice.set(event.voiceId, position + 1);
      const lastRequested = lastRequestedByVoice.get(event.voiceId);
      if (lastRequested === undefined || position > lastRequested) continue;
      selected.push(Object.freeze({ segment, event }));
    }
  }
  return Object.freeze(selected);
}

/**
 * Turn a selected retained-voice prefix into the exact engine preparation
 * requests. Only the first segment of a voice resets its state. Tonguing is
 * already carried by the gesture and must not erase the bore history between
 * notes.
 */
export function buildPhysicalPhrasePreparationNotes(
  notes: readonly PhysicalPreparationNoteIdentity[],
  gestures: readonly ExpressiveVoiceGesture[],
  segments: readonly PhysicalRenderSegment[],
): readonly PhysicalPhrasePreparationNote[] {
  const result: PhysicalPhrasePreparationNote[] = [];
  const selected = selectPhysicalPhrasePreparationEntries(
    notes,
    gestures,
    segments,
  );
  const priorIdentityByVoice = new Map<string, string>();
  for (const { segment, event } of selected) {
    const gesture = gestures[event.gestureIndex];
    if (gesture === undefined) continue;
    const priorIdentity = priorIdentityByVoice.get(event.voiceId);
    const physicalStateReset = priorIdentity === undefined;
    const physicalCacheFingerprint = sha256Hex([
      segment.cacheFingerprint,
      event.eventId,
      event.voiceId,
      String(event.startFrame),
      String(event.durationFrames),
      physicalStateReset ? "reset" : priorIdentity,
    ].join("\u001f"));
    priorIdentityByVoice.set(event.voiceId, physicalCacheFingerprint);
    result.push(Object.freeze({
      midiPitch: event.midiPitch as MidiPitch,
      velocity: event.velocity,
      physicalGesture: gesture,
      physicalFrameCount: event.durationFrames,
      physicalCacheFingerprint,
      physicalStateReset,
    }));
  }
  return Object.freeze(result);
}

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
        /*
         * A "failed" notification is published exactly once per transport
         * fault (X1: any engine refusal or platform error mid-run latches the
         * fault state, and recovery is the contracted
         * `fault --initialize-transport (trusted gesture)--> ready` edge).
         * Clearing the initialized flag here is what makes that edge
         * reachable from the UI: callers gate initialization on
         * `isInitialized()`, so a stale `true` after a fault made every
         * later Play refuse `transport.fault_requires_initialize` until
         * reload (2026-08-07 live incident, jcpe-engine-refusal-fault-
         * cascade-vg8h). The transport's own fault latch is untouched — a
         * bare play without re-initializing still refuses.
         */
        if (notification.status === "failed") initialized = false;
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
  ): Promise<boolean> => {
    let sequence = gesture.sequence;
    for (
      let attempt = 0;
      attempt < ENGINE_READY_RETRY_LIMIT &&
      engine.inspectAudioEngine().state !== "ready";
      attempt += 1
    ) {
      sequence += 1;
      const resumed = await engine.resumeAudioEngine({
        gesture: Object.freeze({ ...gesture, sequence }),
      });
      if (engine.inspectAudioEngine().state === "ready") return true;
      if (!resumed.ok) return false;
      await new Promise((resolveWait) => {
        setTimeout(resolveWait, ENGINE_READY_RETRY_INTERVAL_MS);
      });
    }
    return engine.inspectAudioEngine().state === "ready";
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
        initialized = await awaitEngineReady(gesture);
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
    seek: async (commandRequestId, targetBeat) =>
      submit(
        commandRequestId,
        Object.freeze({ kind: "seek" as const, targetBeat }),
      ),
    setLoop: async (commandRequestId, binding, loop) =>
      submit(
        commandRequestId,
        Object.freeze({ kind: "set-loop" as const, binding, loop }),
      ),
    setPerformance: async (commandRequestId, binding) =>
      submit(
        commandRequestId,
        Object.freeze({ kind: "set-performance" as const, binding }),
      ),
    setMix: async (commandRequestId, mix) =>
      submit(
        commandRequestId,
        Object.freeze({ kind: "set-mix" as const, mix }),
      ),
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
    prepareInstrument: async (instrumentId, notes, binding) => {
      const family = physicalFamilyForInstrumentId(instrumentId);
      // Compile only at the rate the engine will actually render; a plan
      // compiled at a fictional rate carries wrong frames and fingerprints.
      const contextSampleRateHz = engine.inspectAudioEngine().contextSampleRate;
      const physical =
        family === null ||
        binding === undefined ||
        contextSampleRateHz === null ||
        !isPhysicalSupportedSampleRateHz(contextSampleRateHz)
          ? null
          : memoizedPhysicalRealization({
              plan: binding.plan,
              sourcePlanRevision: binding.planRevision,
              instrumentFamily: family,
              instrumentVersionId: `changes.physical.${instrumentId}.v2`,
              parameterPackSha256: physicalParameterPackSha256(instrumentId),
              sampleRateHz: contextSampleRateHz,
            });
      const gesturesByEvent = new Map<string, readonly ExpressiveVoiceGesture[]>();
      if (physical?.ok === true) {
        const mutable = new Map<string, ExpressiveVoiceGesture[]>();
        for (const gesture of physical.value.expressivePlan.gestures) {
          const gestures = mutable.get(gesture.eventId) ?? [];
          gestures.push(gesture);
          mutable.set(gesture.eventId, gestures);
        }
        for (const [eventId, gestures] of mutable) {
          gesturesByEvent.set(eventId, Object.freeze(gestures));
        }
      }
      const ordinaryNotes = notes.map((note) => {
          const physicalGesture = note.eventId === undefined || note.voiceOrdinal === undefined
            ? undefined
            : gesturesByEvent.get(note.eventId)?.[note.voiceOrdinal];
          return Object.freeze({
            midiPitch: note.midiPitch,
            velocity: note.velocity,
            ...(note.gateSeconds === undefined ? {} : { gateSeconds: note.gateSeconds }),
            ...(note.eventId === undefined ? {} : { eventId: note.eventId }),
            ...(physicalGesture === undefined ? {} : { physicalGesture }),
          });
        });
      const physicalPhraseNotes = family === "clarinet" && physical?.ok === true
        ? buildPhysicalPhrasePreparationNotes(
            notes,
            physical.value.expressivePlan.gestures,
            physical.value.renderPlan.segments,
          )
        : ordinaryNotes;
      if (
        family === "clarinet" &&
        physical?.ok === true &&
        notes.length > 0 &&
        physicalPhraseNotes.length === 0
      ) {
        return false;
      }
      let outcome = await engine.prepareRenderedAudioVoices({
        instrumentId,
        notes: physicalPhraseNotes,
      });
      /*
       * A concurrent prepare supersedes this one through the engine's
       * preparation generation and it reports ok-but-incomplete. That race
       * is real on slow physical instruments (measured: the upright bass's
       * instrument-change warm-up still rendering when Play issues its own
       * prepare), and the superseding call caches the same leading buffers,
       * so a bounded re-issue converges instead of refusing the Play.
       */
      for (
        let attempt = 0;
        attempt < 4 && outcome.ok && !outcome.value.completed;
        attempt += 1
      ) {
        outcome = await engine.prepareRenderedAudioVoices({
          instrumentId,
          notes: physicalPhraseNotes,
        });
      }
      /*
       * One extra macrotask before the caller submits transport commands:
       * the browser gets a full event-loop turn to refresh the audio clock
       * after the render burst, so the play epoch anchors on a live reading.
       */
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      return outcome.ok && outcome.value.completed;
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
    transportService: transport,
  });
}

export type StudioPlaybackPlanBinding = Readonly<{
  plan: PlaybackPlan;
  documentId: DocumentId;
  planRevision: number;
}>;
