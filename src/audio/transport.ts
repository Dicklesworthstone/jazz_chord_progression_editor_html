import {
  compareBeatValues,
  INSTRUMENT_IDS,
  makeBeatPosition,
  makeMidiPitch,
  MAX_TEMPO_BPM,
  MIDI_PPQ,
  MIN_TEMPO_BPM,
  subtractBeatValues,
  type BeatPosition,
  type BeatRange,
  type BeatValue,
  type DocumentId,
  type InstrumentId,
  type MidiPitch,
} from "../domain";
import type { PlaybackEvent, PlaybackPlan } from "../playback";
import {
  compilePhysicalRealization,
  physicalFamilyForInstrumentId,
} from "./physical-realization";
import { sha256Hex } from "./deterministic-sha256";
import type { ExpressiveVoiceGesture } from "./physical-renderer-contract";
import {
  AUDIO_MIX_POLICY,
  type AudioEngineResult,
  type AudioRetirementReceipt,
  type AudioVoiceOwner,
  type AudioVoiceSpec,
} from "./audio-engine-contract";
import {
  MAX_TRANSPORT_IMMEDIATE_START_MARGIN_SECONDS,
  MAX_TRANSPORT_LOOKAHEAD_SECONDS,
  MAX_TRANSPORT_PREVIEW_PITCHES,
  MAX_TRANSPORT_QUEUED_COMMANDS,
  MAX_TRANSPORT_TICK_INTERVAL_MS,
  MIN_TRANSPORT_LOOKAHEAD_SECONDS,
  MIN_TRANSPORT_TICK_INTERVAL_MS,
  TRANSPORT_CLICK_ACCENT_MIDI_PITCH,
  TRANSPORT_CLICK_ACCENT_VELOCITY,
  TRANSPORT_CLICK_BEAT_MIDI_PITCH,
  TRANSPORT_CLICK_BEAT_VELOCITY,
  TRANSPORT_CLICK_EVENT_ID_PREFIX,
  TRANSPORT_CLICK_GATE_SECONDS,
  TRANSPORT_CLICK_INSTRUMENT_ID,
  TRANSPORT_INTERRUPTED_FAILURE_CODE,
  TRANSPORT_MIN_AUDIO_GATE_SECONDS,
  TRANSPORT_NOTIFICATION_SCHEMA,
  TRANSPORT_POLICY_ID,
  TRANSPORT_POLICY_VERSION,
  TRANSPORT_PREVIEW_ID_PREFIX,
  TRANSPORT_SNAPSHOT_SCHEMA,
  TRANSPORT_WORK_COUNTER_NAMES,
  type TransportCommand,
  type TransportCommandKind,
  type TransportCommandOutcome,
  type TransportCommandReceipt,
  type TransportCommandRefusal,
  type TransportCommandRequestId,
  type TransportGeneration,
  type TransportNotificationStatus,
  type TransportPlanBinding,
  type TransportPlatformPort,
  type TransportRefusalCode,
  type TransportService,
  type TransportSnapshot,
  type TransportState,
  type TransportTimerHandle,
  type TransportTimingPolicy,
  type TransportWorkCounters,
} from "./transport-contract";

/**
 * X1 production transport: the serialized state machine, generation-owned
 * lookahead scheduler, click generation, preview ownership, and monotonic
 * notification publisher over the X0 engine.
 *
 * Musical time exists only as exact rational beats; audio seconds derive
 * from `beats * 60 / tempoBpm` against a captured audio-clock anchor.
 * Playheads computed from the double-precision clock quantize to the
 * nearest MIDI tick (1/960 beat), the plan's own exact resolution, so a
 * stored pause/seek/interruption beat is always an exact rational value.
 *
 * Count-in occurs exactly when the admitted play command requests it; the
 * `set-count-in`/`set-metronome` toggles hold the application's persistent
 * mode on the transport snapshot, and the metronome toggle drives click
 * generation while playing.
 */

const AUDIO_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const MAX_ID_LENGTH = 128;
const PLAYBACK_PLAN_SCHEMA_PIN = "changes.playback.plan.v1";
const PLAYBACK_COMPILER_ID_PIN = "changes.playback-plan-compiler";
const PLAYBACK_COMPILER_VERSION_PIN = 1;
const PREVIEW_FIXED_VELOCITY = 96;
const MAX_PREVIEW_GATE_SECONDS = 600;

type StableState = "ready" | "playing" | "paused";

type ScheduledEventRecord = Readonly<{
  eventIndex: number;
  eventId: string;
  startSeconds: number;
}>;

type MutableCounters = Record<
  (typeof TRANSPORT_WORK_COUNTER_NAMES)[number],
  number
>;

type NonEmptyVoiceSpecs = readonly [AudioVoiceSpec, ...AudioVoiceSpec[]];

function zeroCounters(): MutableCounters {
  const counters: Partial<MutableCounters> = {};
  for (const name of TRANSPORT_WORK_COUNTER_NAMES) counters[name] = 0;
  return counters as MutableCounters;
}

function freezeCounters(counters: MutableCounters): TransportWorkCounters {
  return Object.freeze({ ...counters });
}

function isPositiveSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value > 0
  );
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
  );
}

function isLegalAudioId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    AUDIO_ID_PATTERN.test(value)
  );
}

function beatToSeconds(beat: BeatValue, tempoBpm: number): number {
  return ((beat.numerator / beat.denominator) * 60) / tempoBpm;
}

function ticksToSeconds(ticks: number, tempoBpm: number): number {
  return ((ticks / MIDI_PPQ) * 60) / tempoBpm;
}

function beatTicks(beat: BeatValue): number {
  return (beat.numerator * MIDI_PPQ) / beat.denominator;
}

/** Quantize an elapsed-seconds offset from an anchor beat to exact ticks. */
function quantizedBeatAt(
  anchorBeat: BeatPosition,
  elapsedSeconds: number,
  tempoBpm: number,
  ceiling: BeatPosition,
): BeatPosition {
  const anchorTicks = beatTicks(anchorBeat);
  const elapsedTicks = Math.max(
    0,
    Math.round(elapsedSeconds * (tempoBpm / 60) * MIDI_PPQ),
  );
  const ticks = Math.min(anchorTicks + elapsedTicks, beatTicks(ceiling));
  const made = makeBeatPosition({ numerator: ticks, denominator: MIDI_PPQ });
  return made.ok ? made.value : anchorBeat;
}

/**
 * Runtime validation helpers accept structurally widened views so hostile
 * or stale callers are checked even where TypeScript already narrows the
 * field types.
 */
type UnknownTiming = Readonly<{
  tickIntervalMs?: unknown;
  lookaheadSeconds?: unknown;
  immediateStartMarginSeconds?: unknown;
}>;

function timingPolicyValid(timing: UnknownTiming): boolean {
  const tick = timing.tickIntervalMs;
  const lookahead = timing.lookaheadSeconds;
  const margin = timing.immediateStartMarginSeconds;
  if (
    margin !== undefined &&
    (typeof margin !== "number" ||
      !Number.isFinite(margin) ||
      margin < 0 ||
      margin > MAX_TRANSPORT_IMMEDIATE_START_MARGIN_SECONDS)
  ) {
    return false;
  }
  return (
    typeof tick === "number" &&
    Number.isFinite(tick) &&
    tick >= MIN_TRANSPORT_TICK_INTERVAL_MS &&
    tick <= MAX_TRANSPORT_TICK_INTERVAL_MS &&
    typeof lookahead === "number" &&
    Number.isFinite(lookahead) &&
    lookahead >= MIN_TRANSPORT_LOOKAHEAD_SECONDS &&
    lookahead <= MAX_TRANSPORT_LOOKAHEAD_SECONDS &&
    lookahead * 1000 > tick
  );
}

type UnknownGesture = Readonly<{
  kind?: unknown;
  trusted?: unknown;
  sequence?: unknown;
}>;

function gestureValid(
  gesture: UnknownGesture,
  lastSequence: number,
): boolean {
  return (
    (gesture.kind === "trusted-pointer" ||
      gesture.kind === "trusted-keyboard") &&
    gesture.trusted === true &&
    isPositiveSafeInteger(gesture.sequence) &&
    gesture.sequence > lastSequence
  );
}

type UnknownBinding = Readonly<{
  plan?: unknown;
  documentId?: unknown;
  planRevision?: unknown;
}>;

function bindingShapeValid(binding: UnknownBinding): boolean {
  return (
    typeof binding.documentId === "string" &&
    binding.documentId.length > 0 &&
    isNonnegativeSafeInteger(binding.planRevision) &&
    typeof binding.plan === "object" &&
    binding.plan !== null
  );
}

type UnknownPlan = Readonly<{
  schema?: unknown;
  compilerId?: unknown;
  compilerVersion?: unknown;
  tempoBpm?: unknown;
  events?: unknown;
  totalTicks?: unknown;
  sourceDocumentId?: unknown;
}>;

/** Structural plan validation independent of any binding identity. */
function planStructurallyValid(plan: UnknownPlan): boolean {
  if (plan.schema !== PLAYBACK_PLAN_SCHEMA_PIN) return false;
  if (plan.compilerId !== PLAYBACK_COMPILER_ID_PIN) return false;
  if (plan.compilerVersion !== PLAYBACK_COMPILER_VERSION_PIN) return false;
  const tempo = plan.tempoBpm;
  if (typeof tempo !== "number" || !Number.isFinite(tempo)) {
    return false;
  }
  const events = plan.events;
  const totalTicks = plan.totalTicks;
  if (!Array.isArray(events)) return false;
  if (!isNonnegativeSafeInteger(totalTicks)) return false;
  const list: readonly unknown[] = events;
  let previousStartTick = -1;
  for (const raw of list) {
    if (!isRecord(raw)) return false;
    const startTick = raw["startTick"];
    const durationTicks = raw["durationTicks"];
    if (!isNonnegativeSafeInteger(startTick)) return false;
    if (startTick < previousStartTick) return false;
    previousStartTick = startTick;
    if (!isPositiveSafeInteger(durationTicks)) return false;
    if (!isLegalAudioId(raw["eventId"])) return false;
    const pitches = raw["midiPitches"];
    if (
      !Array.isArray(pitches) ||
      pitches.length === 0 ||
      pitches.length > MAX_TRANSPORT_PREVIEW_PITCHES
    ) {
      return false;
    }
    if (startTick + durationTicks > totalTicks) return false;
  }
  return true;
}

function planTempoInRange(plan: Readonly<{ tempoBpm?: unknown }>): boolean {
  const tempo = plan.tempoBpm;
  return (
    typeof tempo === "number" &&
    tempo >= MIN_TEMPO_BPM &&
    tempo <= MAX_TEMPO_BPM
  );
}

function nonEmptyVoiceSpecs(
  specs: readonly AudioVoiceSpec[],
): NonEmptyVoiceSpecs | null {
  const [first, ...rest] = specs;
  if (first === undefined) return null;
  return [first, ...rest];
}

const ZERO_BEAT: BeatPosition = (() => {
  const made = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!made.ok) throw new Error("unreachable: zero beat is representable");
  return made.value;
})();

const CLICK_ACCENT_PITCH: MidiPitch = (() => {
  const made = makeMidiPitch(TRANSPORT_CLICK_ACCENT_MIDI_PITCH);
  if (!made.ok) throw new Error("unreachable: reviewed click accent pitch");
  return made.value;
})();

const CLICK_BEAT_PITCH: MidiPitch = (() => {
  const made = makeMidiPitch(TRANSPORT_CLICK_BEAT_MIDI_PITCH);
  if (!made.ok) throw new Error("unreachable: reviewed click beat pitch");
  return made.value;
})();

const LEGAL_INSTRUMENT_IDS: ReadonlySet<string> = new Set(INSTRUMENT_IDS);

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createTransportService(
  platform: TransportPlatformPort,
): TransportService {
  let state: TransportState = "locked";
  let priorStable: StableState = "ready";
  /**
   * Generations are positive safe integers: X0 refuses owner generation
   * zero, and a preview may start before the first play epoch.
   */
  let generation: TransportGeneration = 1;
  let lastSubmittedRequestId = 0;
  let lastAdmittedRequestId: TransportCommandRequestId = 0;
  let notificationSequence = 0;
  let gestureSequence = 0;
  let binding: TransportPlanBinding | null = null;
  let runStartBeat: BeatPosition = ZERO_BEAT;
  let pausedBeat: BeatPosition = ZERO_BEAT;
  let anchorTimeSeconds = 0;
  let anchorBeat: BeatPosition = ZERO_BEAT;
  let loop: BeatRange | null = null;
  let countInEnabled = false;
  let metronomeEnabled = false;
  let instrumentId: InstrumentId = "mellow-keys";
  let physicalLookupPlan: PlaybackPlan | null = null;
  let physicalLookupInstrument: InstrumentId | null = null;
  let physicalLookup = new Map<string, readonly ExpressiveVoiceGesture[]>();
  let timing: TransportTimingPolicy = Object.freeze({
    tickIntervalMs: 25,
    lookaheadSeconds: 0.1,
  });
  let startMarginSeconds = 0;
  let timerHandle: TransportTimerHandle | null = null;
  let cursor = 0;
  let nextClickTick = 0;
  let clickIndex = 0;
  let pendingCountInClicks: readonly Readonly<{
    seconds: number;
    accent: boolean;
  }>[] = [];
  let scheduled: ScheduledEventRecord[] = [];
  let activePreviewId: string | null = null;
  let activePreviewGeneration = 0;
  let viewDocumentId: DocumentId | null = null;
  let viewPlanRevision: number | null = null;
  let queueDepth = 0;
  let chain: Promise<void> = Promise.resolve();
  const work = zeroCounters();

  function stateNow(): TransportState {
    return state;
  }

  function clearTimer(): void {
    if (timerHandle !== null) {
      platform.timer.clearInterval(timerHandle);
      timerHandle = null;
    }
  }

  function publish(
    status: TransportNotificationStatus,
    commandRequestId: TransportCommandRequestId,
    playhead: BeatPosition,
    failure: string | null,
  ): void {
    if (viewDocumentId === null || viewPlanRevision === null) return;
    if (!Number.isSafeInteger(notificationSequence + 1)) {
      state = "fault";
      return;
    }
    notificationSequence += 1;
    work.notificationsPublished += 1;
    platform.publishNotification(
      Object.freeze({
        schema: TRANSPORT_NOTIFICATION_SCHEMA,
        status,
        generation,
        commandRequestId,
        notificationSequence,
        documentId: viewDocumentId,
        planRevision: viewPlanRevision,
        startBeat: runStartBeat,
        playhead,
        failureCode: failure,
      }),
    );
  }

  function retireAll(): AudioEngineResult<AudioRetirementReceipt> {
    const result = platform.engine.retireAudioVoices({
      selector: { kind: "all" },
      reason: "all-notes-off",
      atTimeSeconds: platform.currentTimeSeconds(),
    });
    work.generationsRetired += 1;
    return result;
  }

  /**
   * Retires one progression generation's voices. `atTimeSeconds` defaults to
   * now (Stop, pause, interruption — the sound must end immediately); the
   * loop wrap passes the loop-end instant instead, because the wrap is
   * detected up to a whole lookahead window before the boundary sounds and
   * retiring at detection time would cut the loop's tail notes short on
   * every pass (X1-SCHED-004b).
   */
  function retireProgressionGeneration(
    retiredGeneration: number,
    atTimeSeconds: number = platform.currentTimeSeconds(),
  ): AudioEngineResult<AudioRetirementReceipt> {
    const result = platform.engine.retireAudioVoices({
      selector: {
        kind: "generation",
        ownerKind: "progression",
        generation: retiredGeneration,
      },
      reason: "generation-retire",
      atTimeSeconds,
    });
    work.generationsRetired += 1;
    return result;
  }

  function enterFault(code: string): void {
    if (state === "fault" || state === "disposed") return;
    clearTimer();
    generation += 1;
    state = "fault";
    retireAll();
    publish("failed", lastAdmittedRequestId, pausedBeat, code);
  }

  function currentPlan(): PlaybackPlan | null {
    return binding === null ? null : binding.plan;
  }

  function currentTempo(): number {
    const plan = currentPlan();
    return plan === null ? 120 : plan.tempoBpm;
  }

  function physicalGesturesForEvent(
    plan: PlaybackPlan,
    eventId: string,
  ): readonly ExpressiveVoiceGesture[] {
    const family = physicalFamilyForInstrumentId(instrumentId);
    if (family === null) return Object.freeze([]);
    if (
      physicalLookupPlan !== plan ||
      physicalLookupInstrument !== instrumentId
    ) {
      physicalLookupPlan = plan;
      physicalLookupInstrument = instrumentId;
      physicalLookup = new Map();
      const revision = binding?.planRevision;
      if (revision === undefined) return Object.freeze([]);
      const compiled = compilePhysicalRealization({
        plan,
        sourcePlanRevision: revision,
        instrumentFamily: family,
        instrumentVersionId: `changes.physical.${instrumentId}.v2`,
        parameterPackSha256: sha256Hex(
          `changes.physical.parameter-pack.${instrumentId}.v1`,
        ),
        // Gesture curves are tick-domain data. Segment frames are not consumed
        // by X1; the engine renders at its actual AudioContext sample rate.
        sampleRateHz: 48_000,
      });
      if (compiled.ok) {
        const mutable = new Map<string, ExpressiveVoiceGesture[]>();
        for (const gesture of compiled.value.expressivePlan.gestures) {
          const owned = mutable.get(gesture.eventId) ?? [];
          owned.push(gesture);
          mutable.set(gesture.eventId, owned);
        }
        for (const [ownedEventId, gestures] of mutable) {
          physicalLookup.set(ownedEventId, Object.freeze(gestures));
        }
      }
    }
    return physicalLookup.get(eventId) ?? Object.freeze([]);
  }

  function playheadNow(): BeatPosition {
    if (state === "playing") {
      const plan = currentPlan();
      const ceiling = plan === null ? anchorBeat : plan.totalBeats;
      return quantizedBeatAt(
        anchorBeat,
        platform.currentTimeSeconds() - anchorTimeSeconds,
        currentTempo(),
        ceiling,
      );
    }
    return pausedBeat;
  }

  /** Absolute audio seconds for an exact plan beat inside the epoch. */
  function beatSeconds(beat: BeatPosition): number {
    const forward = subtractBeatValues(beat, anchorBeat);
    if (forward.ok) {
      return anchorTimeSeconds + beatToSeconds(forward.value, currentTempo());
    }
    const backward = subtractBeatValues(anchorBeat, beat);
    return backward.ok
      ? anchorTimeSeconds - beatToSeconds(backward.value, currentTempo())
      : anchorTimeSeconds;
  }

  function issueEventAttack(
    event: PlaybackEvent,
    eventIndex: number,
    startSeconds: number,
  ): boolean {
    const gateSeconds = Math.max(
      beatToSeconds(event.gateDurationBeats, currentTempo()),
      TRANSPORT_MIN_AUDIO_GATE_SECONDS,
    );
    const owner: AudioVoiceOwner = { kind: "progression", generation };
    const plan = currentPlan();
    if (plan === null) return false;
    const physicalGestures = physicalGesturesForEvent(plan, event.eventId);
    const voices = nonEmptyVoiceSpecs(
      event.midiPitches.map((midiPitch, index) => {
        const physicalGesture = physicalGestures[index];
        return {
          voiceId: `${event.eventId}:g${String(generation)}:v${String(index)}`,
          midiPitch,
          velocity: event.velocity,
          ...(physicalGesture === undefined ? {} : { physicalGesture }),
        };
      }),
    );
    if (voices === null) return false;
    /*
     * Physical-plan compilation hashes and validates every gesture in the
     * phrase. Sample the live audio clock only after that bounded CPU work;
     * otherwise a slow browser can spend the entire immediate-start margin
     * compiling and hand X0 an attack timestamp that is already in the past.
     */
    const now = platform.currentTimeSeconds();
    const startTime = Math.max(startSeconds, now + startMarginSeconds);
    const result = platform.engine.attackAudioVoices({
      owner,
      eventId: event.eventId,
      instrumentId,
      startTimeSeconds: startTime,
      releaseTimeSeconds: startTime + gateSeconds,
      voices,
    });
    if (!result.ok) return false;
    work.attackBatchesIssued += 1;
    work.eventsScheduled += 1;
    scheduled.push(
      Object.freeze({ eventIndex, eventId: event.eventId, startSeconds }),
    );
    return true;
  }

  function issueClick(accent: boolean, startSeconds: number): boolean {
    const now = platform.currentTimeSeconds();
    const eventId = `${TRANSPORT_CLICK_EVENT_ID_PREFIX}${String(generation)}:${String(clickIndex)}`;
    clickIndex += 1;
    const startTime = Math.max(startSeconds, now + startMarginSeconds);
    const result = platform.engine.attackAudioVoices({
      owner: { kind: "progression", generation },
      eventId,
      instrumentId: TRANSPORT_CLICK_INSTRUMENT_ID,
      startTimeSeconds: startTime,
      releaseTimeSeconds: startTime + TRANSPORT_CLICK_GATE_SECONDS,
      voices: [
        {
          voiceId: `${eventId}:v0`,
          midiPitch: accent ? CLICK_ACCENT_PITCH : CLICK_BEAT_PITCH,
          velocity: accent
            ? TRANSPORT_CLICK_ACCENT_VELOCITY
            : TRANSPORT_CLICK_BEAT_VELOCITY,
        },
      ],
    });
    if (!result.ok) return false;
    work.clickEventsGenerated += 1;
    return true;
  }

  /** Meter click spacing in plan quarter-note ticks, and clicks per bar. */
  function clickSpacing(): { intervalTicks: number; perBar: number } {
    const plan = currentPlan();
    if (plan === null) return { intervalTicks: MIDI_PPQ, perBar: 4 };
    return {
      intervalTicks: (MIDI_PPQ * 4) / plan.meter.beatUnit,
      perBar: plan.meter.beatsPerBar,
    };
  }

  function firstEventIndexAtOrAfter(
    plan: PlaybackPlan,
    beat: BeatPosition,
  ): number {
    for (let index = 0; index < plan.events.length; index += 1) {
      const event = plan.events[index];
      if (
        event !== undefined &&
        compareBeatValues(event.startBeat, beat) >= 0
      ) {
        return index;
      }
    }
    return plan.events.length;
  }

  function naturalEnd(): void {
    clearTimer();
    generation += 1;
    work.naturalEndsPublished += 1;
    cursor = 0;
    scheduled = [];
    pendingCountInClicks = [];
    pausedBeat = runStartBeat;
    state = "ready";
    priorStable = "ready";
    publish("ready", lastAdmittedRequestId, runStartBeat, null);
  }

  function observeInterruption(): void {
    if (state !== "playing" && state !== "paused" && state !== "ready") {
      return;
    }
    work.interruptionsObserved += 1;
    const beatNow = playheadNow();
    priorStable = state;
    const outgoing = generation;
    generation += 1;
    clearTimer();
    retireProgressionGeneration(outgoing);
    pausedBeat = beatNow;
    state = "interrupted";
    publish(
      "paused",
      lastAdmittedRequestId,
      pausedBeat,
      TRANSPORT_INTERRUPTED_FAILURE_CODE,
    );
  }

  function scheduleHorizon(tickGeneration: number): void {
    if (state !== "playing" || tickGeneration !== generation) {
      work.staleCallbacksIgnored += 1;
      return;
    }
    const engineState = platform.engine.inspectAudioEngine().state;
    if (engineState === "suspended") {
      observeInterruption();
      return;
    }
    if (engineState !== "ready" && engineState !== "resuming") {
      enterFault("transport.engine_refusal");
      return;
    }
    const plan = currentPlan();
    if (plan === null) return;
    const now = platform.currentTimeSeconds();
    const horizonEnd = now + timing.lookaheadSeconds;

    while (pendingCountInClicks.length > 0) {
      const next = pendingCountInClicks[0];
      if (next === undefined || next.seconds > horizonEnd) break;
      if (!issueClick(next.accent, next.seconds)) {
        enterFault("transport.engine_refusal");
        return;
      }
      pendingCountInClicks = pendingCountInClicks.slice(1);
    }
    if (pendingCountInClicks.length > 0) return;

    if (metronomeEnabled) {
      const { intervalTicks, perBar } = clickSpacing();
      const loopEndTicks = loop === null ? null : beatTicks(loop.end);
      for (;;) {
        if (loopEndTicks !== null && nextClickTick >= loopEndTicks) break;
        if (loopEndTicks === null && nextClickTick >= plan.totalTicks) break;
        const clickBeat = makeBeatPosition({
          numerator: nextClickTick,
          denominator: MIDI_PPQ,
        });
        if (!clickBeat.ok) break;
        const seconds = beatSeconds(clickBeat.value);
        if (seconds > horizonEnd) break;
        const ordinal = Math.round(nextClickTick / intervalTicks);
        if (!issueClick(ordinal % perBar === 0, seconds)) {
          enterFault("transport.engine_refusal");
          return;
        }
        nextClickTick += intervalTicks;
      }
    }

    while (cursor < plan.events.length) {
      const event = plan.events[cursor];
      if (event === undefined) break;
      if (
        loop !== null &&
        compareBeatValues(event.startBeat, loop.end) >= 0
      ) {
        break;
      }
      const seconds = beatSeconds(event.startBeat);
      if (seconds > horizonEnd) break;
      if (!issueEventAttack(event, cursor, seconds)) {
        enterFault("transport.engine_refusal");
        return;
      }
      cursor += 1;
    }

    if (loop !== null) {
      const loopEndSeconds = beatSeconds(loop.end);
      if (loopEndSeconds <= horizonEnd) {
        const outgoing = generation;
        generation += 1;
        work.loopWraps += 1;
        /* The clock may have overshot the boundary between ticks; the engine
         * refuses a retirement in the past, so clamp to now in that case. */
        retireProgressionGeneration(outgoing, Math.max(now, loopEndSeconds));
        anchorTimeSeconds = loopEndSeconds;
        anchorBeat = loop.start;
        cursor = firstEventIndexAtOrAfter(plan, loop.start);
        nextClickTick = beatTicks(loop.start);
        startTimer();
      }
      return;
    }

    if (cursor >= plan.events.length) {
      const endSeconds = beatSeconds(plan.totalBeats);
      if (now >= endSeconds) naturalEnd();
    }
  }

  function startTimer(): void {
    clearTimer();
    const tickGeneration = generation;
    timerHandle = platform.timer.setInterval(() => {
      work.schedulerTicks += 1;
      scheduleHorizon(tickGeneration);
    }, timing.tickIntervalMs);
  }

  function refuse(
    commandRequestId: TransportCommandRequestId,
    kind: TransportCommandKind | null,
    code: TransportRefusalCode,
    engineRefusalCode: TransportCommandRefusal["engineRefusalCode"] = null,
  ): TransportCommandRefusal {
    work.commandsRefused += 1;
    return Object.freeze({
      termination: "refusal",
      commandRequestId,
      kind,
      code,
      engineRefusalCode,
      state,
      work: freezeCounters(work),
    });
  }

  function receipt(
    commandRequestId: TransportCommandRequestId,
    kind: TransportCommandKind,
    stateBefore: TransportState,
    noFutureAttackPostcondition: boolean,
  ): TransportCommandReceipt {
    work.commandsAdmitted += 1;
    return Object.freeze({
      termination: "receipt",
      commandRequestId,
      kind,
      stateBefore,
      stateAfter: state,
      generation,
      noFutureAttackPostcondition,
      work: freezeCounters(work),
    });
  }

  /** Retire every scheduled-but-not-yet-attacked event; rewind the cursor. */
  function retireUnattackedHorizon(): number {
    const now = platform.currentTimeSeconds();
    const pending = scheduled.filter((record) => record.startSeconds > now);
    if (pending.length === 0) return 0;
    let minIndex = cursor;
    for (const record of pending) {
      platform.engine.retireAudioVoices({
        selector: {
          kind: "event",
          owner: { kind: "progression", generation },
          eventId: record.eventId,
        },
        reason: "generation-retire",
        atTimeSeconds: now,
      });
      minIndex = Math.min(minIndex, record.eventIndex);
    }
    scheduled = scheduled.filter((record) => record.startSeconds <= now);
    const rewound = cursor - minIndex;
    cursor = minIndex;
    return rewound;
  }

  function beginPlayingEpoch(
    plan: PlaybackPlan,
    startBeat: BeatPosition,
    commandRequestId: TransportCommandRequestId,
  ): boolean {
    anchorTimeSeconds = platform.currentTimeSeconds();
    anchorBeat = startBeat;
    cursor = firstEventIndexAtOrAfter(plan, startBeat);
    scheduled = [];
    pendingCountInClicks = [];
    nextClickTick = alignClickTick(beatTicks(startBeat));
    state = "playing";
    priorStable = "playing";
    scheduleHorizon(generation);
    const after = stateNow();
    if (after === "ready") return true;
    if (after !== "playing") return false;
    startTimer();
    publish("playing", commandRequestId, startBeat, null);
    return true;
  }

  function alignClickTick(startTicks: number): number {
    const { intervalTicks } = clickSpacing();
    return Math.ceil(startTicks / intervalTicks) * intervalTicks;
  }

  async function execute(
    command: TransportCommand,
  ): Promise<TransportCommandOutcome> {
    const { commandRequestId, payload } = command;
    const kind = payload.kind;
    const stateBefore = state;

    if (state === "disposed") {
      return refuse(commandRequestId, kind, "transport.disposed");
    }
    if (
      state === "locked" &&
      kind !== "initialize-transport" &&
      kind !== "dispose-transport"
    ) {
      return refuse(commandRequestId, kind, "transport.locked");
    }
    if (
      state === "fault" &&
      kind !== "initialize-transport" &&
      kind !== "dispose-transport"
    ) {
      return refuse(
        commandRequestId,
        kind,
        "transport.fault_requires_initialize",
      );
    }

    switch (kind) {
      case "initialize-transport": {
        if (state !== "locked" && state !== "fault") {
          return refuse(commandRequestId, kind, "transport.state_invalid");
        }
        if (!gestureValid(payload.gesture, gestureSequence)) {
          return refuse(commandRequestId, kind, "transport.gesture_invalid");
        }
        if (!timingPolicyValid(payload.timing)) {
          return refuse(
            commandRequestId,
            kind,
            "transport.timing_policy_invalid",
          );
        }
        const echoDocumentId: unknown = payload.documentId;
        if (
          typeof echoDocumentId !== "string" ||
          echoDocumentId.length === 0 ||
          !isNonnegativeSafeInteger(payload.planRevision)
        ) {
          return refuse(commandRequestId, kind, "transport.plan_mismatch");
        }
        gestureSequence = payload.gesture.sequence;
        const initialized = await platform.engine.initializeAudioEngine({
          gesture: payload.gesture,
          initialMix: payload.initialMix,
        });
        if (!initialized.ok) {
          return refuse(
            commandRequestId,
            kind,
            "transport.engine_refusal",
            initialized.refusal.code,
          );
        }
        timing = Object.freeze({
          tickIntervalMs: payload.timing.tickIntervalMs,
          lookaheadSeconds: payload.timing.lookaheadSeconds,
          immediateStartMarginSeconds:
            payload.timing.immediateStartMarginSeconds ?? 0,
        });
        startMarginSeconds = payload.timing.immediateStartMarginSeconds ?? 0;
        viewDocumentId = payload.documentId;
        viewPlanRevision = payload.planRevision;
        state = "ready";
        priorStable = "ready";
        pausedBeat = ZERO_BEAT;
        runStartBeat = ZERO_BEAT;
        publish("ready", commandRequestId, pausedBeat, null);
        return receipt(commandRequestId, kind, stateBefore, true);
      }
      case "play": {
        if (state !== "ready") {
          return refuse(commandRequestId, kind, "transport.state_invalid");
        }
        if (
          !bindingShapeValid(payload.binding) ||
          !planStructurallyValid(payload.binding.plan)
        ) {
          return refuse(commandRequestId, kind, "transport.plan_invalid");
        }
        if (
          payload.binding.documentId !==
          payload.binding.plan.sourceDocumentId
        ) {
          return refuse(commandRequestId, kind, "transport.plan_mismatch");
        }
        if (!planTempoInRange(payload.binding.plan)) {
          return refuse(commandRequestId, kind, "transport.tempo_out_of_range");
        }
        const plan = payload.binding.plan;
        if (compareBeatValues(payload.startBeat, plan.totalBeats) > 0) {
          return refuse(
            commandRequestId,
            kind,
            "transport.start_beat_out_of_range",
          );
        }
        const outgoing = generation;
        generation += 1;
        retireProgressionGeneration(outgoing);
        binding = payload.binding;
        loop = plan.loop;
        viewDocumentId = payload.binding.documentId;
        viewPlanRevision = payload.binding.planRevision;
        runStartBeat = payload.startBeat;
        pausedBeat = payload.startBeat;
        clickIndex = 0;
        if (payload.countIn) {
          const { intervalTicks, perBar } = clickSpacingFor(plan);
          const now = platform.currentTimeSeconds();
          anchorTimeSeconds =
            now + ticksToSeconds(intervalTicks * perBar, plan.tempoBpm);
          anchorBeat = payload.startBeat;
          cursor = firstEventIndexAtOrAfter(plan, payload.startBeat);
          scheduled = [];
          nextClickTick = alignClickTick(beatTicks(payload.startBeat));
          pendingCountInClicks = Array.from(
            { length: perBar },
            (_, index) =>
              Object.freeze({
                seconds:
                  now + ticksToSeconds(intervalTicks * index, plan.tempoBpm),
                accent: index === 0,
              }),
          );
          state = "playing";
          priorStable = "playing";
          scheduleHorizon(generation);
          const after = stateNow();
          if (after !== "playing") {
            return refuse(commandRequestId, kind, "transport.engine_refusal");
          }
          startTimer();
          publish("playing", commandRequestId, payload.startBeat, null);
          return receipt(commandRequestId, kind, stateBefore, true);
        }
        if (
          loop === null &&
          compareBeatValues(payload.startBeat, plan.totalBeats) === 0
        ) {
          state = "playing";
          priorStable = "playing";
          naturalEnd();
          return receipt(commandRequestId, kind, stateBefore, true);
        }
        if (!beginPlayingEpoch(plan, payload.startBeat, commandRequestId)) {
          return refuse(commandRequestId, kind, "transport.engine_refusal");
        }
        return receipt(commandRequestId, kind, stateBefore, true);
      }
      case "pause": {
        if (state !== "playing") {
          return refuse(commandRequestId, kind, "transport.state_invalid");
        }
        const beatNow = playheadNow();
        const outgoing = generation;
        generation += 1;
        clearTimer();
        const retired = retireProgressionGeneration(outgoing);
        const postcondition = retired.ok
          ? retired.value.noFutureAttackPostcondition
          : false;
        pausedBeat = beatNow;
        scheduled = [];
        state = "paused";
        priorStable = "paused";
        publish("paused", commandRequestId, pausedBeat, null);
        return receipt(commandRequestId, kind, stateBefore, postcondition);
      }
      case "resume": {
        if (state === "interrupted") {
          if (
            payload.gesture === null ||
            !gestureValid(payload.gesture, gestureSequence)
          ) {
            return refuse(commandRequestId, kind, "transport.gesture_invalid");
          }
          gestureSequence = payload.gesture.sequence;
          const resumed = await platform.engine.resumeAudioEngine({
            gesture: payload.gesture,
          });
          if (!resumed.ok) {
            return refuse(
              commandRequestId,
              kind,
              "transport.engine_refusal",
              resumed.refusal.code,
            );
          }
          generation += 1;
          state = priorStable;
          if (state === "playing") {
            const plan = currentPlan();
            if (plan === null) {
              state = "ready";
              publish("ready", commandRequestId, pausedBeat, null);
            } else if (
              !beginPlayingEpoch(plan, pausedBeat, commandRequestId)
            ) {
              return refuse(
                commandRequestId,
                kind,
                "transport.engine_refusal",
              );
            }
          } else {
            publish(
              state === "paused" ? "paused" : "ready",
              commandRequestId,
              pausedBeat,
              null,
            );
          }
          return receipt(commandRequestId, kind, stateBefore, true);
        }
        if (state !== "paused") {
          return refuse(commandRequestId, kind, "transport.state_invalid");
        }
        if (
          payload.gesture !== null &&
          !gestureValid(payload.gesture, gestureSequence)
        ) {
          return refuse(commandRequestId, kind, "transport.gesture_invalid");
        }
        if (payload.gesture !== null) {
          gestureSequence = payload.gesture.sequence;
        }
        const plan = currentPlan();
        if (plan === null) {
          return refuse(commandRequestId, kind, "transport.plan_mismatch");
        }
        generation += 1;
        if (!beginPlayingEpoch(plan, pausedBeat, commandRequestId)) {
          return refuse(commandRequestId, kind, "transport.engine_refusal");
        }
        return receipt(commandRequestId, kind, stateBefore, true);
      }
      case "seek": {
        if (state !== "playing" && state !== "paused") {
          return refuse(commandRequestId, kind, "transport.state_invalid");
        }
        const plan = currentPlan();
        if (plan === null) {
          return refuse(commandRequestId, kind, "transport.plan_mismatch");
        }
        if (compareBeatValues(payload.targetBeat, plan.totalBeats) > 0) {
          return refuse(commandRequestId, kind, "transport.seek_out_of_range");
        }
        const wasPlaying = state === "playing";
        const outgoing = generation;
        generation += 1;
        clearTimer();
        const retired = retireProgressionGeneration(outgoing);
        const postcondition = retired.ok
          ? retired.value.noFutureAttackPostcondition
          : false;
        pausedBeat = payload.targetBeat;
        scheduled = [];
        if (wasPlaying) {
          if (!beginPlayingEpoch(plan, payload.targetBeat, commandRequestId)) {
            return refuse(commandRequestId, kind, "transport.engine_refusal");
          }
        } else {
          cursor = firstEventIndexAtOrAfter(plan, payload.targetBeat);
          state = "paused";
          publish("paused", commandRequestId, payload.targetBeat, null);
        }
        return receipt(commandRequestId, kind, stateBefore, postcondition);
      }
      case "stop": {
        if (
          state !== "ready" &&
          state !== "playing" &&
          state !== "paused" &&
          state !== "interrupted"
        ) {
          return refuse(commandRequestId, kind, "transport.state_invalid");
        }
        if (state === "ready") {
          publish("ready", commandRequestId, runStartBeat, null);
          return receipt(commandRequestId, kind, stateBefore, true);
        }
        generation += 1;
        clearTimer();
        const retired = retireAll();
        const postcondition = retired.ok
          ? retired.value.noFutureAttackPostcondition
          : false;
        activePreviewId = null;
        scheduled = [];
        cursor = 0;
        pausedBeat = runStartBeat;
        state = "ready";
        priorStable = "ready";
        publish("ready", commandRequestId, runStartBeat, null);
        return receipt(commandRequestId, kind, stateBefore, postcondition);
      }
      case "set-tempo": {
        if (state !== "ready" && state !== "playing" && state !== "paused") {
          return refuse(commandRequestId, kind, "transport.state_invalid");
        }
        if (
          !bindingShapeValid(payload.binding) ||
          !planStructurallyValid(payload.binding.plan)
        ) {
          return refuse(commandRequestId, kind, "transport.plan_invalid");
        }
        if (
          payload.binding.plan.tempoBpm < MIN_TEMPO_BPM ||
          payload.binding.plan.tempoBpm > MAX_TEMPO_BPM
        ) {
          return refuse(
            commandRequestId,
            kind,
            "transport.tempo_out_of_range",
          );
        }
        if (
          binding === null ||
          payload.binding.documentId !== binding.documentId ||
          payload.binding.planRevision <= binding.planRevision ||
          payload.binding.documentId !==
            payload.binding.plan.sourceDocumentId
        ) {
          return refuse(commandRequestId, kind, "transport.plan_mismatch");
        }
        if (state === "playing") {
          const beatNow = playheadNow();
          retireUnattackedHorizon();
          generation += 1;
          binding = payload.binding;
          viewPlanRevision = payload.binding.planRevision;
          if (
            !beginPlayingEpoch(payload.binding.plan, beatNow, commandRequestId)
          ) {
            return refuse(commandRequestId, kind, "transport.engine_refusal");
          }
        } else {
          if (state === "paused") generation += 1;
          binding = payload.binding;
          viewPlanRevision = payload.binding.planRevision;
          publish(
            state === "paused" ? "paused" : "ready",
            commandRequestId,
            pausedBeat,
            null,
          );
        }
        return receipt(commandRequestId, kind, stateBefore, true);
      }
      case "set-loop": {
        if (state !== "ready" && state !== "playing" && state !== "paused") {
          return refuse(commandRequestId, kind, "transport.state_invalid");
        }
        if (
          !bindingShapeValid(payload.binding) ||
          !planStructurallyValid(payload.binding.plan)
        ) {
          return refuse(commandRequestId, kind, "transport.plan_invalid");
        }
        if (!planTempoInRange(payload.binding.plan)) {
          return refuse(commandRequestId, kind, "transport.tempo_out_of_range");
        }
        if (
          binding === null ||
          payload.binding.documentId !== binding.documentId ||
          payload.binding.planRevision !== binding.planRevision ||
          payload.binding.documentId !==
            payload.binding.plan.sourceDocumentId
        ) {
          return refuse(commandRequestId, kind, "transport.plan_mismatch");
        }
        const declaredLoop = payload.loop;
        const planLoop = payload.binding.plan.loop;
        if (declaredLoop === null) {
          if (planLoop !== null) {
            return refuse(commandRequestId, kind, "transport.loop_invalid");
          }
        } else if (
          planLoop === null ||
          compareBeatValues(declaredLoop.start, planLoop.start) !== 0 ||
          compareBeatValues(declaredLoop.end, planLoop.end) !== 0 ||
          compareBeatValues(declaredLoop.start, declaredLoop.end) >= 0 ||
          compareBeatValues(
            declaredLoop.end,
            payload.binding.plan.totalBeats,
          ) > 0
        ) {
          return refuse(commandRequestId, kind, "transport.loop_invalid");
        }
        if (state === "playing") {
          const beatNow = playheadNow();
          retireUnattackedHorizon();
          generation += 1;
          binding = payload.binding;
          loop = declaredLoop;
          if (
            !beginPlayingEpoch(payload.binding.plan, beatNow, commandRequestId)
          ) {
            return refuse(commandRequestId, kind, "transport.engine_refusal");
          }
        } else {
          if (state === "paused") generation += 1;
          binding = payload.binding;
          loop = declaredLoop;
          publish(
            state === "paused" ? "paused" : "ready",
            commandRequestId,
            pausedBeat,
            null,
          );
        }
        return receipt(commandRequestId, kind, stateBefore, true);
      }
      case "set-performance": {
        /*
         * Live groove switch (jcpe-7ftl): the set-tempo epoch law with a
         * newly performed plan. Guards mirror set-tempo exactly — a groove
         * change is a document edit, so the binding must carry the same
         * document and a strictly greater plan revision. The swap takes
         * effect at the next unstarted event: the unattacked horizon is
         * retired, the epoch re-anchors at the current exact beat, and
         * voices already sounding finish on the old groove. Events of the
         * new plan whose start lies before the swap beat are skipped by
         * firstEventIndexAtOrAfter — stated in the contract, not hidden.
         */
        if (state !== "ready" && state !== "playing" && state !== "paused") {
          return refuse(commandRequestId, kind, "transport.state_invalid");
        }
        if (
          !bindingShapeValid(payload.binding) ||
          !planStructurallyValid(payload.binding.plan)
        ) {
          return refuse(commandRequestId, kind, "transport.plan_invalid");
        }
        if (!planTempoInRange(payload.binding.plan)) {
          return refuse(
            commandRequestId,
            kind,
            "transport.tempo_out_of_range",
          );
        }
        if (
          binding === null ||
          payload.binding.documentId !== binding.documentId ||
          payload.binding.planRevision <= binding.planRevision ||
          payload.binding.documentId !==
            payload.binding.plan.sourceDocumentId
        ) {
          return refuse(commandRequestId, kind, "transport.plan_mismatch");
        }
        if (state === "playing") {
          const beatNow = playheadNow();
          retireUnattackedHorizon();
          generation += 1;
          binding = payload.binding;
          viewPlanRevision = payload.binding.planRevision;
          if (
            !beginPlayingEpoch(payload.binding.plan, beatNow, commandRequestId)
          ) {
            return refuse(commandRequestId, kind, "transport.engine_refusal");
          }
        } else {
          if (state === "paused") generation += 1;
          binding = payload.binding;
          viewPlanRevision = payload.binding.planRevision;
          publish(
            state === "paused" ? "paused" : "ready",
            commandRequestId,
            pausedBeat,
            null,
          );
        }
        return receipt(commandRequestId, kind, stateBefore, true);
      }
      case "set-instrument": {
        if (state !== "ready" && state !== "playing" && state !== "paused") {
          return refuse(commandRequestId, kind, "transport.state_invalid");
        }
        const candidate: unknown = payload.instrumentId;
        if (
          typeof candidate !== "string" ||
          !LEGAL_INSTRUMENT_IDS.has(candidate)
        ) {
          return refuse(
            commandRequestId,
            kind,
            "transport.instrument_unknown",
          );
        }
        instrumentId = payload.instrumentId;
        if (state === "playing") {
          const rewound = retireUnattackedHorizon();
          if (rewound > 0) {
            work.horizonReschedules += 1;
            scheduleHorizon(generation);
            if ((state as TransportState) !== "playing") {
              return refuse(
                commandRequestId,
                kind,
                "transport.engine_refusal",
              );
            }
          }
        }
        return receipt(commandRequestId, kind, stateBefore, true);
      }
      case "set-mix": {
        if (state !== "ready" && state !== "playing" && state !== "paused") {
          return refuse(commandRequestId, kind, "transport.state_invalid");
        }
        /* jcpe-v2r-live-mix-btb4: a live mix ride. Basic shape refusal here;
         * the engine's own ramped setAudioMix re-validates and applies with
         * cancel-and-hold-then-linear-ramp, so nothing clicks. Not a
         * generation boundary: the schedule is untouched. */
        const candidate: unknown = payload.mix;
        const masterVolume =
          typeof candidate === "object" && candidate !== null
            ? (candidate as { masterVolume?: unknown }).masterVolume
            : undefined;
        const reverbAmount =
          typeof candidate === "object" && candidate !== null
            ? (candidate as { reverbAmount?: unknown }).reverbAmount
            : undefined;
        if (
          typeof masterVolume !== "number" ||
          !Number.isFinite(masterVolume) ||
          masterVolume < AUDIO_MIX_POLICY.minimumMasterVolume ||
          masterVolume > AUDIO_MIX_POLICY.maximumMasterVolume ||
          typeof reverbAmount !== "number" ||
          !Number.isFinite(reverbAmount) ||
          reverbAmount < AUDIO_MIX_POLICY.minimumReverbAmount ||
          reverbAmount > AUDIO_MIX_POLICY.maximumReverbAmount
        ) {
          return refuse(commandRequestId, kind, "transport.mix_invalid");
        }
        const applied = platform.engine.setAudioMix(
          Object.freeze({ masterVolume, reverbAmount }),
        );
        if (!applied.ok) {
          return refuse(commandRequestId, kind, "transport.engine_refusal");
        }
        return receipt(commandRequestId, kind, stateBefore, true);
      }
      case "set-count-in": {
        if (state !== "ready" && state !== "playing" && state !== "paused") {
          return refuse(commandRequestId, kind, "transport.state_invalid");
        }
        const enabled: unknown = payload.enabled;
        if (typeof enabled !== "boolean") {
          return refuse(commandRequestId, kind, "transport.count_in_invalid");
        }
        countInEnabled = enabled;
        return receipt(commandRequestId, kind, stateBefore, true);
      }
      case "set-metronome": {
        if (state !== "ready" && state !== "playing" && state !== "paused") {
          return refuse(commandRequestId, kind, "transport.state_invalid");
        }
        const enabled: unknown = payload.enabled;
        if (typeof enabled !== "boolean") {
          return refuse(commandRequestId, kind, "transport.metronome_invalid");
        }
        metronomeEnabled = enabled;
        return receipt(commandRequestId, kind, stateBefore, true);
      }
      case "start-preview": {
        if (state !== "ready" && state !== "playing" && state !== "paused") {
          return refuse(commandRequestId, kind, "transport.state_invalid");
        }
        const previewId: unknown = payload.previewId;
        if (
          !isLegalAudioId(previewId) ||
          !previewId.startsWith(TRANSPORT_PREVIEW_ID_PREFIX) ||
          previewId.length <= TRANSPORT_PREVIEW_ID_PREFIX.length
        ) {
          return refuse(commandRequestId, kind, "transport.preview_invalid");
        }
        const pitches: unknown = payload.midiPitches;
        if (
          !Array.isArray(pitches) ||
          pitches.length === 0 ||
          pitches.length > MAX_TRANSPORT_PREVIEW_PITCHES ||
          pitches.some(
            (pitch) =>
              typeof pitch !== "number" ||
              !Number.isInteger(pitch) ||
              pitch < 0 ||
              pitch > 127,
          )
        ) {
          return refuse(commandRequestId, kind, "transport.preview_invalid");
        }
        const gate: unknown = payload.gateSeconds;
        if (
          typeof gate !== "number" ||
          !Number.isFinite(gate) ||
          gate < TRANSPORT_MIN_AUDIO_GATE_SECONDS ||
          gate > MAX_PREVIEW_GATE_SECONDS
        ) {
          return refuse(commandRequestId, kind, "transport.preview_invalid");
        }
        const previewInstrument: unknown = payload.instrumentId;
        if (
          typeof previewInstrument !== "string" ||
          !LEGAL_INSTRUMENT_IDS.has(previewInstrument)
        ) {
          return refuse(
            commandRequestId,
            kind,
            "transport.instrument_unknown",
          );
        }
        const now = platform.currentTimeSeconds();
        if (activePreviewId !== null) {
          platform.engine.retireAudioVoices({
            selector: {
              kind: "preview",
              generation: activePreviewGeneration,
              previewId: activePreviewId,
            },
            reason: "preview-release",
            atTimeSeconds: now,
          });
          work.previewsReleased += 1;
        }
        const voices = nonEmptyVoiceSpecs(
          payload.midiPitches.map((midiPitch, index) => ({
            voiceId: `${payload.previewId}:v${String(index)}`,
            midiPitch,
            velocity: PREVIEW_FIXED_VELOCITY,
          })),
        );
        if (voices === null) {
          return refuse(commandRequestId, kind, "transport.preview_invalid");
        }
        const attacked = platform.engine.attackAudioVoices({
          owner: {
            kind: "preview",
            generation,
            previewId: payload.previewId,
          },
          eventId: payload.previewId,
          instrumentId: payload.instrumentId,
          startTimeSeconds: now + startMarginSeconds,
          releaseTimeSeconds: now + startMarginSeconds + payload.gateSeconds,
          voices,
        });
        if (!attacked.ok) {
          return refuse(
            commandRequestId,
            kind,
            "transport.engine_refusal",
            attacked.refusal.code,
          );
        }
        activePreviewId = payload.previewId;
        activePreviewGeneration = generation;
        work.previewsStarted += 1;
        return receipt(commandRequestId, kind, stateBefore, true);
      }
      case "release-preview": {
        if (state !== "ready" && state !== "playing" && state !== "paused") {
          return refuse(commandRequestId, kind, "transport.state_invalid");
        }
        if (
          activePreviewId === null ||
          payload.previewId !== activePreviewId
        ) {
          return refuse(commandRequestId, kind, "transport.preview_invalid");
        }
        platform.engine.retireAudioVoices({
          selector: {
            kind: "preview",
            generation: activePreviewGeneration,
            previewId: activePreviewId,
          },
          reason: "preview-release",
          atTimeSeconds: platform.currentTimeSeconds(),
        });
        activePreviewId = null;
        work.previewsReleased += 1;
        return receipt(commandRequestId, kind, stateBefore, true);
      }
      case "replace-plan": {
        if (
          state !== "ready" &&
          state !== "playing" &&
          state !== "paused" &&
          state !== "interrupted"
        ) {
          return refuse(commandRequestId, kind, "transport.state_invalid");
        }
        if (payload.binding !== null) {
          if (
            !bindingShapeValid(payload.binding) ||
            !planStructurallyValid(payload.binding.plan)
          ) {
            return refuse(commandRequestId, kind, "transport.plan_invalid");
          }
          if (
            payload.binding.documentId !==
            payload.binding.plan.sourceDocumentId
          ) {
            return refuse(commandRequestId, kind, "transport.plan_mismatch");
          }
          if (!planTempoInRange(payload.binding.plan)) {
            return refuse(
              commandRequestId,
              kind,
              "transport.tempo_out_of_range",
            );
          }
        }
        generation += 1;
        clearTimer();
        const retired = retireAll();
        const postcondition = retired.ok
          ? retired.value.noFutureAttackPostcondition
          : false;
        activePreviewId = null;
        scheduled = [];
        cursor = 0;
        binding = payload.binding;
        loop = payload.binding === null ? null : payload.binding.plan.loop;
        runStartBeat = ZERO_BEAT;
        pausedBeat = ZERO_BEAT;
        state = "ready";
        priorStable = "ready";
        if (payload.binding !== null) {
          viewDocumentId = payload.binding.documentId;
          viewPlanRevision = payload.binding.planRevision;
          publish("ready", commandRequestId, ZERO_BEAT, null);
        }
        return receipt(commandRequestId, kind, stateBefore, postcondition);
      }
      case "dispose-transport": {
        clearTimer();
        if (state !== "locked" && state !== "fault") {
          generation += 1;
        }
        await platform.engine.disposeAudioEngine({
          reason: "page-teardown",
        });
        activePreviewId = null;
        scheduled = [];
        binding = null;
        state = "disposed";
        return receipt(commandRequestId, kind, stateBefore, true);
      }
    }
  }

  function clickSpacingFor(plan: PlaybackPlan): {
    intervalTicks: number;
    perBar: number;
  } {
    return {
      intervalTicks: (MIDI_PPQ * 4) / plan.meter.beatUnit,
      perBar: plan.meter.beatsPerBar,
    };
  }

  async function submitTransportCommand(
    command: TransportCommand,
  ): Promise<TransportCommandOutcome> {
    const commandRequestId: unknown = command.commandRequestId;
    const declaredKind = command.payload.kind;
    if (state === "disposed") {
      return refuse(
        typeof commandRequestId === "number" ? commandRequestId : 0,
        declaredKind,
        "transport.disposed",
      );
    }
    if (
      !isPositiveSafeInteger(commandRequestId) ||
      commandRequestId <= lastSubmittedRequestId
    ) {
      if (
        typeof commandRequestId === "number" &&
        Number.isSafeInteger(commandRequestId)
      ) {
        lastSubmittedRequestId = Math.max(
          lastSubmittedRequestId,
          commandRequestId,
        );
      }
      return refuse(
        typeof commandRequestId === "number" ? commandRequestId : 0,
        declaredKind,
        "transport.command_request_id_invalid",
      );
    }
    lastSubmittedRequestId = commandRequestId;
    if (queueDepth >= MAX_TRANSPORT_QUEUED_COMMANDS) {
      return refuse(
        commandRequestId,
        declaredKind,
        "transport.queue_overflow",
      );
    }
    queueDepth += 1;
    const outcome = chain.then(async () => {
      lastAdmittedRequestId = commandRequestId;
      try {
        return await execute(command);
      } finally {
        queueDepth -= 1;
      }
    });
    chain = outcome.then(
      () => undefined,
      () => undefined,
    );
    return outcome;
  }

  function inspectTransport(): TransportSnapshot {
    return Object.freeze({
      schema: TRANSPORT_SNAPSHOT_SCHEMA,
      policyId: TRANSPORT_POLICY_ID,
      policyVersion: TRANSPORT_POLICY_VERSION,
      state,
      generation,
      lastCommandRequestId: lastAdmittedRequestId,
      lastNotificationSequence: notificationSequence,
      documentId: viewDocumentId,
      planRevision: viewPlanRevision,
      startBeat: binding === null ? null : runStartBeat,
      pausedBeat: binding === null ? null : pausedBeat,
      loop,
      countInEnabled,
      metronomeEnabled,
      instrumentId,
      timing,
      queuedCommandCount: queueDepth,
      scheduledEventCursor: cursor,
      work: freezeCounters(work),
    });
  }

  /**
   * Display-only read of the live playhead. `playheadNow()` already computes
   * the exact quantized beat for command handlers; exposing that same value is
   * a pure read: no state, generation, queue, scheduler, or counter changes.
   */
  function readDisplayPlayheadBeat(): BeatPosition {
    return playheadNow();
  }

  return Object.freeze({
    submitTransportCommand,
    inspectTransport,
    readDisplayPlayheadBeat,
  });
}
