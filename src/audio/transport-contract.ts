import type {
  BeatPosition,
  BeatRange,
  DocumentId,
  InstrumentId,
  MidiPitch,
} from "../domain";
import type { PlaybackPlan } from "../playback";
import type {
  AudioEngine,
  AudioEngineRefusalCode,
  AudioMix,
  AudioUserGestureReceipt,
} from "./audio-engine-contract";

/**
 * X1 serialized transport contract.
 *
 * The transport service is the only owner of musical wall-clock scheduling.
 * It consumes immutable P0 playback plans and the X0 engine operations; it
 * never touches Web Audio nodes, documents, theory, application state, or UI.
 * The application projects the notifications defined here into its own
 * `TransportViewState`; this file must stay structurally compatible with that
 * projection without importing the application layer.
 */

export const TRANSPORT_CONTRACT_SCHEMA =
  "changes.audio.transport-contract.v1";
export const TRANSPORT_SNAPSHOT_SCHEMA =
  "changes.audio.transport-snapshot.v1";
export const TRANSPORT_NOTIFICATION_SCHEMA =
  "changes.audio.transport-notification.v1";
export const TRANSPORT_POLICY_ID = "changes.audio-transport";
export const TRANSPORT_POLICY_VERSION = 1;
export const TRANSPORT_SCHEDULER_POLICY_ID =
  "changes.audio-transport-scheduler";
export const TRANSPORT_SCHEDULER_POLICY_VERSION = 1;
export const TRANSPORT_CLICK_POLICY_ID = "changes.audio-transport-click";
export const TRANSPORT_CLICK_POLICY_VERSION = 1;

export const TRANSPORT_OPERATION_NAMES = Object.freeze([
  "submitTransportCommand",
  "inspectTransport",
] as const);

export type TransportOperationName =
  (typeof TRANSPORT_OPERATION_NAMES)[number];

/**
 * Authoritative service states (REBUILD_PLAN 13.7). `disposed` is the
 * terminal page-teardown state and is unreachable by ordinary commands.
 */
export const TRANSPORT_STATES = Object.freeze([
  "locked",
  "ready",
  "playing",
  "paused",
  "interrupted",
  "fault",
  "disposed",
] as const);

export type TransportState = (typeof TRANSPORT_STATES)[number];

/**
 * Notification statuses accepted by the application projection. `starting`
 * and `stopping` are application-side expectations; the service publishes
 * only settled statuses. `locked` and `disposed` publish nothing.
 */
export const TRANSPORT_NOTIFICATION_STATUSES = Object.freeze([
  "ready",
  "playing",
  "paused",
  "failed",
] as const);

export type TransportNotificationStatus =
  (typeof TRANSPORT_NOTIFICATION_STATUSES)[number];

/**
 * Exact state-to-status projection. `interrupted` reports `paused` with the
 * stable failure code `transport.interrupted` so an actionable recovery
 * gesture can be presented without inventing a new application status.
 */
export const TRANSPORT_STATE_STATUS_PROJECTION = Object.freeze({
  ready: "ready",
  playing: "playing",
  paused: "paused",
  interrupted: "paused",
  fault: "failed",
} as const);

export const TRANSPORT_INTERRUPTED_FAILURE_CODE = "transport.interrupted";

export const TRANSPORT_COMMAND_KINDS = Object.freeze([
  "initialize-transport",
  "play",
  "pause",
  "resume",
  "seek",
  "stop",
  "set-tempo",
  "set-loop",
  "set-instrument",
  "set-count-in",
  "set-metronome",
  "start-preview",
  "release-preview",
  "replace-plan",
  "dispose-transport",
] as const);

export type TransportCommandKind = (typeof TRANSPORT_COMMAND_KINDS)[number];

export const TRANSPORT_TERMINATIONS = Object.freeze([
  "receipt",
  "refusal",
  "fault",
] as const);

export type TransportTermination = (typeof TRANSPORT_TERMINATIONS)[number];

export const TRANSPORT_REFUSAL_CODES = Object.freeze([
  "transport.locked",
  "transport.disposed",
  "transport.fault_requires_initialize",
  "transport.state_invalid",
  "transport.gesture_invalid",
  "transport.command_request_id_invalid",
  "transport.queue_overflow",
  "transport.timing_policy_invalid",
  "transport.plan_invalid",
  "transport.plan_mismatch",
  "transport.start_beat_out_of_range",
  "transport.seek_out_of_range",
  "transport.tempo_out_of_range",
  "transport.loop_invalid",
  "transport.instrument_unknown",
  "transport.preview_invalid",
  "transport.count_in_invalid",
  "transport.metronome_invalid",
  "transport.engine_refusal",
  "transport.internal_sequence_exhausted",
] as const);

export type TransportRefusalCode = (typeof TRANSPORT_REFUSAL_CODES)[number];

/**
 * Validation precedence inside one admitted command. Earlier names refuse
 * before later names are examined; every failure is total and mutates
 * nothing except one debug event and the cumulative work counters.
 */
export const TRANSPORT_REFUSAL_PRECEDENCE = Object.freeze([
  "transport.disposed",
  "transport.locked",
  "transport.command_request_id_invalid",
  "transport.queue_overflow",
  "transport.fault_requires_initialize",
  "transport.state_invalid",
  "transport.gesture_invalid",
  "transport.timing_policy_invalid",
  "transport.plan_invalid",
  "transport.plan_mismatch",
  "transport.start_beat_out_of_range",
  "transport.seek_out_of_range",
  "transport.tempo_out_of_range",
  "transport.loop_invalid",
  "transport.instrument_unknown",
  "transport.preview_invalid",
  "transport.count_in_invalid",
  "transport.metronome_invalid",
  "transport.engine_refusal",
  "transport.internal_sequence_exhausted",
] as const);

export const TRANSPORT_WORK_COUNTER_NAMES = Object.freeze([
  "commandsAdmitted",
  "commandsRefused",
  "schedulerTicks",
  "eventsScheduled",
  "attackBatchesIssued",
  "clickEventsGenerated",
  "horizonReschedules",
  "loopWraps",
  "generationsRetired",
  "previewsStarted",
  "previewsReleased",
  "naturalEndsPublished",
  "notificationsPublished",
  "staleCallbacksIgnored",
  "interruptionsObserved",
] as const);

export type TransportWorkCounterName =
  (typeof TRANSPORT_WORK_COUNTER_NAMES)[number];

export type TransportWorkCounters = Readonly<
  Record<TransportWorkCounterName, number>
>;

/**
 * Timing policy. Correctness never depends on the control-thread interval:
 * every scheduled attack uses absolute audio-clock seconds and generation
 * checks. The lookahead ceiling leaves an explicit 0.05 s margin under the
 * X0 attack admission window of 0.25 s.
 */
export const TRANSPORT_TICK_INTERVAL_MS_DEFAULT = 25;
export const MIN_TRANSPORT_TICK_INTERVAL_MS = 10;
export const MAX_TRANSPORT_TICK_INTERVAL_MS = 100;
export const TRANSPORT_LOOKAHEAD_SECONDS_DEFAULT = 0.1;
export const MIN_TRANSPORT_LOOKAHEAD_SECONDS = 0.05;
export const MAX_TRANSPORT_LOOKAHEAD_SECONDS = 0.2;
/**
 * Optional measured-browser start margin. The live audio clock can advance
 * between the scheduler's read and the X0 admission read, so an attack
 * whose exact start is at or behind the moving clock is issued at
 * now + margin instead of being refused as already past. Zero (the
 * default) preserves exact fake-clock behavior; real-browser composition
 * roots set a small measured value. Never a musical cutoff: it can only
 * delay an already-due attack by the margin.
 */
export const TRANSPORT_IMMEDIATE_START_MARGIN_SECONDS_DEFAULT = 0;
export const MAX_TRANSPORT_IMMEDIATE_START_MARGIN_SECONDS = 0.02;
export const TRANSPORT_X0_ATTACK_WINDOW_MARGIN_SECONDS = 0.05;

export const MAX_TRANSPORT_QUEUED_COMMANDS = 32;
export const MAX_TRANSPORT_GENERATION = Number.MAX_SAFE_INTEGER;
export const MAX_TRANSPORT_COMMAND_REQUEST_ID = Number.MAX_SAFE_INTEGER;
export const MAX_TRANSPORT_NOTIFICATION_SEQUENCE = Number.MAX_SAFE_INTEGER;
export const MAX_TRANSPORT_PLAN_REVISION = Number.MAX_SAFE_INTEGER;

/**
 * Natural end lets owned release and reverb tails decay; by this deadline
 * after the final note-off every voice is retired and the registry is empty.
 * The value equals the X0 natural-cleanup ceiling; explicit Stop instead uses
 * the immediate X0 generation-retirement ramp.
 */
export const TRANSPORT_NATURAL_END_TAIL_DEADLINE_SECONDS = 8;
export const TRANSPORT_STOP_RELEASE_SECONDS = 0.012;

/**
 * Deterministic audio-envelope floor (equal to the X0 minimum gate). It
 * applies only to the Web Audio release time of one attack; exact beats,
 * ticks, the plan, and MIDI export are untouched. It can only lengthen,
 * never silence (golden witnesses X1-TIME-013/014).
 */
export const TRANSPORT_MIN_AUDIO_GATE_SECONDS = 0.005;

/**
 * Count-in and metronome click policy `changes.audio-transport-click@1`.
 * Clicks are generated transport events rendered through the one persistent
 * X0 graph as ordinary progression-owner voices; the reviewed X0 topology
 * authority (twelve nodes, thirteen edges) supersedes any informal notion of
 * a separate click bus. Click event IDs use the reserved prefix so document
 * event identity can never collide with a generated click.
 */
export const TRANSPORT_CLICK_EVENT_ID_PREFIX = "x1:click:";
export const TRANSPORT_CLICK_INSTRUMENT_ID: InstrumentId = "vibraphone";
export const TRANSPORT_CLICK_ACCENT_MIDI_PITCH = 88;
export const TRANSPORT_CLICK_BEAT_MIDI_PITCH = 81;
export const TRANSPORT_CLICK_ACCENT_VELOCITY = 112;
export const TRANSPORT_CLICK_BEAT_VELOCITY = 84;
export const TRANSPORT_CLICK_GATE_SECONDS = 0.06;
export const TRANSPORT_COUNT_IN_BARS = 1;

export const TRANSPORT_PREVIEW_ID_PREFIX = "x1:preview:";
export const MAX_TRANSPORT_PREVIEW_PITCHES = 16;

/**
 * Every generation-incrementing transition. Any epoch boundary retires the
 * outgoing progression generation before the incoming epoch may schedule.
 */
export const TRANSPORT_GENERATION_BOUNDARIES = Object.freeze([
  "play",
  "pause",
  "resume",
  "seek",
  "stop",
  "set-tempo",
  "set-loop",
  "loop-wrap",
  "replace-plan",
  "interruption",
  "interruption-recovery",
  "natural-end",
  "fault",
] as const);

export type TransportGenerationBoundary =
  (typeof TRANSPORT_GENERATION_BOUNDARIES)[number];

export type TransportTimingPolicy = Readonly<{
  tickIntervalMs: number;
  lookaheadSeconds: number;
  /** Measured-browser immediate-start margin; omitted means zero. */
  immediateStartMarginSeconds?: number;
}>;

/** Positive safe integer identifying one submitted command. */
export type TransportCommandRequestId = number;
/** Positive safe integer epoch/generation owned by the transport. */
export type TransportGeneration = number;
/** Positive safe integer, strictly increasing across the service lifetime. */
export type TransportNotificationSequence = number;
/** Nonnegative safe integer application revision that compiled the plan. */
export type TransportPlanRevision = number;

export type TransportPlanBinding = Readonly<{
  plan: PlaybackPlan;
  documentId: DocumentId;
  planRevision: TransportPlanRevision;
}>;

export type TransportCommandPayload =
  | Readonly<{
      kind: "initialize-transport";
      gesture: AudioUserGestureReceipt;
      timing: TransportTimingPolicy;
      /** Forwarded to the X0 engine initialization unchanged. */
      initialMix: AudioMix;
      /**
       * View-identity echo: the application's current document ID and plan
       * revision, installed by its expect-transport intent. The transport
       * echoes them in the ready notification so the A0 acceptance law can
       * match; it never reads the document.
       */
      documentId: DocumentId;
      planRevision: TransportPlanRevision;
    }>
  | Readonly<{
      kind: "play";
      binding: TransportPlanBinding;
      startBeat: BeatPosition;
      countIn: boolean;
    }>
  | Readonly<{ kind: "pause" }>
  | Readonly<{ kind: "resume"; gesture: AudioUserGestureReceipt | null }>
  | Readonly<{ kind: "seek"; targetBeat: BeatPosition }>
  | Readonly<{ kind: "stop" }>
  | Readonly<{ kind: "set-tempo"; binding: TransportPlanBinding }>
  | Readonly<{
      kind: "set-loop";
      binding: TransportPlanBinding;
      loop: BeatRange | null;
    }>
  | Readonly<{ kind: "set-instrument"; instrumentId: InstrumentId }>
  | Readonly<{ kind: "set-count-in"; enabled: boolean }>
  | Readonly<{ kind: "set-metronome"; enabled: boolean }>
  | Readonly<{
      kind: "start-preview";
      previewId: string;
      instrumentId: InstrumentId;
      midiPitches: readonly [MidiPitch, ...MidiPitch[]];
      gateSeconds: number;
    }>
  | Readonly<{ kind: "release-preview"; previewId: string }>
  | Readonly<{ kind: "replace-plan"; binding: TransportPlanBinding | null }>
  | Readonly<{ kind: "dispose-transport"; reason: "page-teardown" }>;

export type TransportCommand = Readonly<{
  commandRequestId: TransportCommandRequestId;
  payload: TransportCommandPayload;
}>;

export type TransportServiceNotification = Readonly<{
  schema: typeof TRANSPORT_NOTIFICATION_SCHEMA;
  status: TransportNotificationStatus;
  generation: TransportGeneration;
  commandRequestId: TransportCommandRequestId;
  notificationSequence: TransportNotificationSequence;
  documentId: DocumentId;
  planRevision: TransportPlanRevision;
  startBeat: BeatPosition;
  playhead: BeatPosition;
  failureCode: string | null;
}>;

export type TransportCommandReceipt = Readonly<{
  termination: "receipt";
  commandRequestId: TransportCommandRequestId;
  kind: TransportCommandKind;
  stateBefore: TransportState;
  stateAfter: TransportState;
  generation: TransportGeneration;
  /**
   * True only after every X0 retirement receipt required by this command
   * reported `noFutureAttackPostcondition` and the scheduler cursor and
   * control handles were cleared. Stop, seek, pause, replace-plan, and
   * dispose must set it; commands that retire nothing report `true`
   * vacuously.
   */
  noFutureAttackPostcondition: boolean;
  work: TransportWorkCounters;
}>;

export type TransportCommandRefusal = Readonly<{
  termination: "refusal";
  commandRequestId: TransportCommandRequestId;
  kind: TransportCommandKind | null;
  code: TransportRefusalCode;
  engineRefusalCode: AudioEngineRefusalCode | null;
  state: TransportState;
  work: TransportWorkCounters;
}>;

export type TransportCommandOutcome =
  | TransportCommandReceipt
  | TransportCommandRefusal;

export type TransportSnapshot = Readonly<{
  schema: typeof TRANSPORT_SNAPSHOT_SCHEMA;
  policyId: typeof TRANSPORT_POLICY_ID;
  policyVersion: typeof TRANSPORT_POLICY_VERSION;
  state: TransportState;
  generation: TransportGeneration;
  lastCommandRequestId: TransportCommandRequestId;
  lastNotificationSequence: TransportNotificationSequence;
  documentId: DocumentId | null;
  planRevision: TransportPlanRevision | null;
  startBeat: BeatPosition | null;
  pausedBeat: BeatPosition | null;
  loop: BeatRange | null;
  countInEnabled: boolean;
  metronomeEnabled: boolean;
  instrumentId: InstrumentId;
  timing: TransportTimingPolicy;
  queuedCommandCount: number;
  scheduledEventCursor: number;
  work: TransportWorkCounters;
}>;

/**
 * Injected platform ports. The timer port is the only legal control-thread
 * ticker; `requestAnimationFrame` is display-only and never appears here.
 * The clock must be the audio-context clock exposed by the X0 platform; wall
 * timers cannot define musical time.
 */
export type TransportTimerHandle = number;

export type TransportTimerPort = Readonly<{
  setInterval: (
    callback: () => void,
    intervalMs: number,
  ) => TransportTimerHandle;
  clearInterval: (handle: TransportTimerHandle) => void;
}>;

export type TransportPlatformPort = Readonly<{
  engine: AudioEngine;
  currentTimeSeconds: () => number;
  timer: TransportTimerPort;
  publishNotification: (
    notification: TransportServiceNotification,
  ) => void;
}>;

export type TransportService = Readonly<{
  submitTransportCommand: (
    command: TransportCommand,
  ) => Promise<TransportCommandOutcome>;
  inspectTransport: () => TransportSnapshot;
}>;
