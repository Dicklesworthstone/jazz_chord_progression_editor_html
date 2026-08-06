import {
  createAudioEngine,
  createTransportService,
  type AudioUserGestureReceipt,
  type TransportCommandOutcome,
  type TransportCommandPayload,
  type TransportCommandReceipt,
  type TransportCommandRefusal,
  type TransportPlanBinding,
  type TransportService,
  type TransportServiceNotification,
  type TransportTimerHandle,
  type TransportTimerPort,
} from "../../src/audio";
import { compilePlaybackPlan, type PlaybackPlan } from "../../src/playback";
import { makeBeatPosition, type BeatRange } from "../../src/domain";
import {
  createFakeAudioPlatform,
  type FakeAudioContextController,
  type FakeAudioPlatformHarness,
} from "../../src/test-support/fake-audio-platform";
import {
  freshP0CompileRequest,
  freshP0RealizationMap,
  materializeP0DocumentRecipe,
  materializeP0TimelineCase,
} from "./p0-playback-fixtures";

/**
 * Shared X1 transport test harness: the real X0 engine over the fake audio
 * platform, a manually fired fake control timer, a settable audio clock,
 * and a notification collector. Production transport code is exercised;
 * expected values come from the reviewed fixtures, never from this kit.
 */

export type FakeTransportTimer = Readonly<{
  port: TransportTimerPort;
  fire: (times?: number) => void;
  activeHandleCount: () => number;
}>;

export function createFakeTransportTimer(): FakeTransportTimer {
  const callbacks = new Map<TransportTimerHandle, () => void>();
  let nextHandle = 1;
  return Object.freeze({
    port: Object.freeze({
      setInterval(callback: () => void, intervalMs: number): TransportTimerHandle {
        if (!(intervalMs > 0)) throw new Error("TIMER_INTERVAL_INVALID");
        const handle = nextHandle;
        nextHandle += 1;
        callbacks.set(handle, callback);
        return handle;
      },
      clearInterval(handle: TransportTimerHandle): void {
        callbacks.delete(handle);
      },
    }),
    fire(times = 1): void {
      for (let index = 0; index < times; index += 1) {
        for (const callback of [...callbacks.values()]) callback();
      }
    },
    activeHandleCount(): number {
      return callbacks.size;
    },
  });
}

export type RecordedAttack = Readonly<{
  ownerKind: "progression" | "preview";
  generation: number;
  eventId: string;
  instrumentId: string;
  startTimeSeconds: number;
  releaseTimeSeconds: number;
  voiceCount: number;
  physicalGestureCount: number;
  accepted: boolean;
}>;

export type RecordedRetirement = Readonly<{
  selectorKind: string;
  reason: string;
  atTimeSeconds: number;
}>;

export type TransportHarness = Readonly<{
  service: TransportService;
  engine: ReturnType<typeof createAudioEngine>;
  fake: FakeAudioPlatformHarness;
  timer: FakeTransportTimer;
  notifications: readonly TransportServiceNotification[];
  attacks: readonly RecordedAttack[];
  retirements: readonly RecordedRetirement[];
  controller: () => FakeAudioContextController;
  setClock: (seconds: number) => void;
  clock: () => number;
  nextRequestId: () => number;
  submit: (payload: TransportCommandPayload) => Promise<TransportCommandOutcome>;
}>;

export function createTransportHarness(
  options: Readonly<{ sampleRate?: number }> = {},
): TransportHarness {
  const fake = createFakeAudioPlatform(
    options.sampleRate === undefined ? {} : { sampleRate: options.sampleRate },
  );
  const engine = createAudioEngine(fake.platform);
  const timer = createFakeTransportTimer();
  const notifications: TransportServiceNotification[] = [];
  const attacks: RecordedAttack[] = [];
  const retirements: RecordedRetirement[] = [];
  const recordingEngine: typeof engine = Object.freeze({
    ...engine,
    attackAudioVoices(request) {
      const result = engine.attackAudioVoices(request);
      attacks.push(
        Object.freeze({
          ownerKind: request.owner.kind,
          generation: request.owner.generation,
          eventId: request.eventId,
          instrumentId: request.instrumentId,
          startTimeSeconds: request.startTimeSeconds,
          releaseTimeSeconds: request.releaseTimeSeconds,
          voiceCount: request.voices.length,
          physicalGestureCount: request.voices.filter(
            ({ physicalGesture }) => physicalGesture !== undefined,
          ).length,
          accepted: result.ok,
        }),
      );
      return result;
    },
    retireAudioVoices(request) {
      retirements.push(
        Object.freeze({
          selectorKind: request.selector.kind,
          reason: request.reason,
          atTimeSeconds: request.atTimeSeconds,
        }),
      );
      return engine.retireAudioVoices(request);
    },
  });
  let now = 0;
  let requestId = 0;
  const service = createTransportService({
    engine: recordingEngine,
    currentTimeSeconds: () => now,
    timer: timer.port,
    publishNotification: (notification) => {
      notifications.push(notification);
    },
  });
  function controller(): FakeAudioContextController {
    const first = fake.contexts[0];
    if (first === undefined) {
      throw new Error("TRANSPORT_KIT_CONTEXT_NOT_CREATED");
    }
    return first;
  }
  return Object.freeze({
    service,
    engine,
    fake,
    timer,
    notifications,
    attacks,
    retirements,
    controller,
    setClock(seconds: number): void {
      now = seconds;
      const first = fake.contexts[0];
      if (first !== undefined) first.setCurrentTime(seconds);
    },
    clock: () => now,
    nextRequestId: () => {
      requestId += 1;
      return requestId;
    },
    async submit(payload: TransportCommandPayload) {
      requestId += 1;
      return service.submitTransportCommand({
        commandRequestId: requestId,
        payload,
      });
    },
  });
}


export type CustomPlanOptions = Readonly<{
  documentId: string;
  tempoBpm: number;
  durations: readonly Readonly<{ numerator: number; denominator: number }>[];
  meter?: Readonly<{ beatsPerBar: number; beatUnit: number }>;
  loop?: Readonly<{
    start: Readonly<{ numerator: number; denominator: number }>;
    end: Readonly<{ numerator: number; denominator: number }>;
  }> | null;
}>;

/**
 * Compile a fresh production plan from a custom recipe through the real
 * F2 decoder, F3 gate, and P0 compiler. Used to reach reviewed tempi and
 * durations (golden timing, tempo-change epochs) with a stable document
 * identity across revisions.
 */
function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x === 0 ? 1 : x;
}

function rationalSum(
  values: readonly Readonly<{ numerator: number; denominator: number }>[],
): Readonly<{ numerator: number; denominator: number }> {
  let numerator = 0;
  let denominator = 1;
  for (const value of values) {
    numerator = numerator * value.denominator + value.numerator * denominator;
    denominator *= value.denominator;
    const divisor = greatestCommonDivisor(numerator, denominator);
    numerator /= divisor;
    denominator /= divisor;
  }
  return { numerator, denominator };
}

export function customPlan(options: CustomPlanOptions): PlaybackPlan {
  const meter = options.meter ?? { beatsPerBar: 8, beatUnit: 4 };
  const events = options.durations.map((duration, index) => ({
    eventId: `event-x1-${String(index + 1)}`,
    duration,
    sourceRef: "P0-SOURCE-AUTO-CMAJ7",
  }));
  const eventSum = rationalSum(options.durations);
  const capacityBeats = meter.beatsPerBar * (4 / meter.beatUnit);
  const sumsToCapacity =
    eventSum.numerator === capacityBeats * eventSum.denominator;
  const materialized = materializeP0DocumentRecipe({
    documentId: options.documentId,
    tempoBpm: options.tempoBpm,
    meter,
    sections: [
      {
        sectionId: "section-x1-a",
        voiceLeadingBoundary: "reset",
        measures: [
          {
            measureId: "measure-x1-a1",
            completion: sumsToCapacity
              ? { kind: "complete" as const }
              : {
                  kind: "incomplete" as const,
                  expectedDuration: eventSum,
                  reason: "transport timing fixture",
                },
            events,
          },
        ],
      },
    ],
    loop: null,
  });
  const bindings = freshP0RealizationMap(
    materialized.document,
    materialized.sourceByEventId,
  );
  let loop: BeatRange | null = null;
  if (options.loop !== undefined && options.loop !== null) {
    const start = makeBeatPosition(options.loop.start);
    const end = makeBeatPosition(options.loop.end);
    if (!start.ok || !end.ok) throw new Error("TRANSPORT_KIT_LOOP_BEATS");
    loop = Object.freeze({ start: start.value, end: end.value });
  }
  const request = freshP0CompileRequest(
    materialized.document,
    bindings,
    loop,
  );
  const result = compilePlaybackPlan(request);
  if (!result.ok) {
    throw new Error(`TRANSPORT_KIT_CUSTOM_PLAN:${result.refusal.code}`);
  }
  return result.plan;
}

let gestureSequence = 0;

export function trustedGesture(): AudioUserGestureReceipt {
  gestureSequence += 1;
  return Object.freeze({
    kind: "trusted-pointer",
    trusted: true,
    sequence: gestureSequence,
  });
}

let cachedPlan: PlaybackPlan | null = null;

/** A real production-compiled plan from the reviewed P0 timeline corpus. */
export function compiledPlan(): PlaybackPlan {
  if (cachedPlan !== null) return cachedPlan;
  const result = compilePlaybackPlan(
    materializeP0TimelineCase("P0-TIME-001").request,
  );
  if (!result.ok) {
    throw new Error(`TRANSPORT_KIT_PLAN:${result.refusal.code}`);
  }
  cachedPlan = result.plan;
  return result.plan;
}

export function planBinding(
  plan: PlaybackPlan,
  planRevision = 1,
): TransportPlanBinding {
  return Object.freeze({
    plan,
    documentId: plan.sourceDocumentId,
    planRevision,
  });
}

export function initializePayload(
  plan: PlaybackPlan,
): TransportCommandPayload {
  return Object.freeze({
    kind: "initialize-transport",
    gesture: trustedGesture(),
    timing: Object.freeze({ tickIntervalMs: 25, lookaheadSeconds: 0.1 }),
    initialMix: Object.freeze({ masterVolume: 0.8, reverbAmount: 0.2 }),
    documentId: plan.sourceDocumentId,
    planRevision: 0,
  });
}

export function requireReceipt(
  outcome: TransportCommandOutcome,
): TransportCommandReceipt {
  if (outcome.termination !== "receipt") {
    throw new Error(
      `TRANSPORT_KIT_EXPECTED_RECEIPT:${outcome.code}:${outcome.kind ?? "?"}`,
    );
  }
  return outcome;
}

export function requireRefusal(
  outcome: TransportCommandOutcome,
): TransportCommandRefusal {
  if (outcome.termination !== "refusal") {
    throw new Error("TRANSPORT_KIT_EXPECTED_REFUSAL");
  }
  return outcome;
}
