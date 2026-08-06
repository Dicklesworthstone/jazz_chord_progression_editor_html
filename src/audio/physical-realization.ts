import type { PlaybackEvent, PlaybackPlan } from "../playback";
import type { InstrumentId } from "../domain";
import { sha256Hex, sha256LowUint32 } from "./deterministic-sha256";
import {
  EXPRESSIVE_REALIZATION_PLAN_SCHEMA,
  PHYSICAL_ARTICULATION_IDS,
  PHYSICAL_CONTROL_IDS,
  PHYSICAL_CURVE_INTERPOLATIONS,
  PHYSICAL_INSTRUMENT_FAMILIES,
  PHYSICAL_RENDER_LIMITS,
  PHYSICAL_RENDER_PLAN_SCHEMA,
  PHYSICAL_RENDER_WORK_COUNTER_NAMES,
  type ExpressiveRealizationPlan,
  type ExpressiveVoiceGesture,
  type PhysicalArticulationId,
  type PhysicalControlId,
  type PhysicalInstrumentFamily,
  type PhysicalRenderEvent,
  type PhysicalRenderMode,
  type PhysicalRenderPlan,
  type PhysicalRenderRefusal,
  type PhysicalRenderResult,
  type PhysicalRenderSegment,
  type PhysicalRenderWorkCounterName,
  type PhysicalRenderWorkCounters,
  type QuantizedPhysicalControlCurve,
} from "./physical-renderer-contract";

export type CompilePhysicalRealizationRequest = Readonly<{
  plan: PlaybackPlan;
  sourcePlanRevision: number;
  instrumentFamily: PhysicalInstrumentFamily;
  instrumentVersionId: string;
  parameterPackSha256: string;
  sampleRateHz: 44_100 | 48_000 | 96_000;
}>;

export type CompiledPhysicalRealization = Readonly<{
  expressivePlan: ExpressiveRealizationPlan;
  renderPlan: PhysicalRenderPlan;
}>;

type MutableWork = Record<PhysicalRenderWorkCounterName, number>;

type ExpandedVoiceEvent = Readonly<{
  source: PlaybackEvent;
  gestureIndex: number;
  voiceId: string;
  midiPitch: number;
  startFrame: number;
  durationFrames: number;
  endFrame: number;
  articulation: PhysicalArticulationId;
}>;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const RELEASE_JOIN_TICKS = 30;

function ownedControls(
  ...controlIds: readonly PhysicalControlId[]
): readonly PhysicalControlId[] {
  return Object.freeze(controlIds);
}

const CONTROL_OWNERSHIP = Object.freeze({
  clarinet: ownedControls(
    "air.pressure",
    "air.turbulence",
    "tongue.contact",
    "reed.stiffness",
    "reed.opening",
    "vibrato.depth",
    "vibrato.rate",
  ),
  flute: ownedControls(
    "air.pressure",
    "air.turbulence",
    "embouchure.offset",
    "embouchure.jet-delay",
    "tongue.contact",
    "vibrato.depth",
    "vibrato.rate",
  ),
  guitar: ownedControls(
    "pick.position",
    "pick.hardness",
    "pick.direction",
    "string.damping",
    "pickup.position",
  ),
  trumpet: ownedControls(
    "air.pressure",
    "tongue.contact",
    "lip.resonance",
    "lip.aperture",
    "vibrato.depth",
    "vibrato.rate",
  ),
  vibraphone: ownedControls(
    "mallet.hardness",
    "strike.position",
    "pedal.position",
    "fan.rate",
    "fan.phase",
  ),
}) satisfies Readonly<
  Record<PhysicalInstrumentFamily, readonly PhysicalControlId[]>
>;

function emptyWork(): MutableWork {
  return Object.fromEntries(
    PHYSICAL_RENDER_WORK_COUNTER_NAMES.map((name) => [name, 0]),
  ) as MutableWork;
}

function freezeWork(work: MutableWork): PhysicalRenderWorkCounters {
  return Object.freeze({ ...work });
}

function refuse(
  work: MutableWork,
  code: PhysicalRenderRefusal["code"],
  path: string,
  message: string,
): PhysicalRenderResult<CompiledPhysicalRealization> {
  work.diagnosticsPublished += 1;
  return Object.freeze({
    ok: false,
    refusal: Object.freeze({
      code,
      path,
      message,
      work: freezeWork(work),
    }),
  });
}

function q16(value: number): number {
  return Math.round(value * 65_536);
}

function point(offsetTicks: number, value: number) {
  return Object.freeze({ offsetTicks, valueQ16_16: q16(value) });
}

function curve(
  controlId: PhysicalControlId,
  interpolation: QuantizedPhysicalControlCurve["interpolation"],
  points: readonly ReturnType<typeof point>[],
): QuantizedPhysicalControlCurve {
  return Object.freeze({
    controlId,
    interpolation,
    points: Object.freeze([...points]),
  });
}

function pressureForVelocity(velocity: number): number {
  return 0.35 + (velocity / 127) * 0.65;
}

function stableGestureText(gesture: ExpressiveVoiceGesture): string {
  return [
    gesture.eventId,
    gesture.voiceId,
    gesture.instrumentFamily,
    gesture.instrumentVersionId,
    gesture.articulation,
    String(gesture.deterministicSeedUint32),
    ...gesture.curves.flatMap((controlCurve) => [
      controlCurve.controlId,
      controlCurve.interpolation,
      ...controlCurve.points.flatMap(({ offsetTicks, valueQ16_16 }) => [
        String(offsetTicks),
        String(valueQ16_16),
      ]),
    ]),
  ].join("\u001f");
}

/** Exact cache identity for the immutable render-affecting gesture bytes. */
export function physicalGestureFingerprint(
  gesture: ExpressiveVoiceGesture,
): string {
  return sha256Hex(stableGestureText(gesture));
}

/**
 * Map the gesture's physical excitation onto the legacy renderer's 1..127
 * excitation inlet. This is an explicit v1 compatibility bridge: it makes
 * the production renderer consume gesture dynamics while the v2 ABI grows
 * native curve and state inputs.
 */
export function physicalGestureExcitationVelocity(
  gesture: ExpressiveVoiceGesture,
  fallbackVelocity: number,
): number {
  const inlet = gesture.instrumentFamily === "guitar"
    ? "pick.hardness"
    : gesture.instrumentFamily === "vibraphone"
      ? "mallet.hardness"
      : "air.pressure";
  const values = gesture.curves
    .find(({ controlId }) => controlId === inlet)
    ?.points.map(({ valueQ16_16 }) => valueQ16_16 / 65_536) ?? [];
  if (values.length === 0) return fallbackVelocity;
  const peak = Math.max(...values);
  return Math.max(1, Math.min(127, Math.round(peak * 127)));
}

export function physicalFamilyForInstrumentId(
  instrumentId: InstrumentId,
): PhysicalInstrumentFamily | null {
  if (instrumentId === "clarinet") return "clarinet";
  if (instrumentId === "flute") return "flute";
  if (instrumentId === "guitar" || instrumentId === "blues-guitar") {
    return "guitar";
  }
  if (instrumentId === "vibraphone") return "vibraphone";
  return null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Defensive X0 boundary check for an optional gesture carried by a voice. */
export function isExpressiveVoiceGesture(
  value: unknown,
): value is ExpressiveVoiceGesture {
  if (!isRecord(value)) return false;
  const family = value["instrumentFamily"];
  if (
    typeof value["eventId"] !== "string" ||
    !ID_PATTERN.test(value["eventId"]) ||
    typeof value["voiceId"] !== "string" ||
    !ID_PATTERN.test(value["voiceId"]) ||
    typeof value["instrumentVersionId"] !== "string" ||
    !ID_PATTERN.test(value["instrumentVersionId"]) ||
    !PHYSICAL_INSTRUMENT_FAMILIES.some((candidate) => candidate === family) ||
    !PHYSICAL_ARTICULATION_IDS.some((candidate) => candidate === value["articulation"]) ||
    !Number.isInteger(value["deterministicSeedUint32"]) ||
    (value["deterministicSeedUint32"] as number) < 0 ||
    (value["deterministicSeedUint32"] as number) > 0xffff_ffff
  ) {
    return false;
  }
  const curves = value["curves"];
  if (
    !Array.isArray(curves) ||
    curves.length === 0 ||
    curves.length > PHYSICAL_RENDER_LIMITS.maximumCurvesPerGesture
  ) {
    return false;
  }
  const owned = CONTROL_OWNERSHIP[family as PhysicalInstrumentFamily];
  const seen = new Set<string>();
  let totalPoints = 0;
  for (const candidate of curves) {
    if (!isRecord(candidate)) return false;
    const controlId = candidate["controlId"];
    if (
      !PHYSICAL_CONTROL_IDS.some((control) => control === controlId) ||
      !owned.some((control) => control === controlId) ||
      seen.has(controlId as string) ||
      !PHYSICAL_CURVE_INTERPOLATIONS.some(
        (interpolation) => interpolation === candidate["interpolation"],
      )
    ) {
      return false;
    }
    seen.add(controlId as string);
    const points = candidate["points"];
    if (
      !Array.isArray(points) ||
      points.length === 0 ||
      points.length > PHYSICAL_RENDER_LIMITS.maximumPointsPerCurve
    ) {
      return false;
    }
    totalPoints += points.length;
    let priorOffset = -1;
    for (const candidatePoint of points) {
      if (!isRecord(candidatePoint)) return false;
      const offset = candidatePoint["offsetTicks"];
      const controlValue = candidatePoint["valueQ16_16"];
      if (
        typeof offset !== "number" ||
        !Number.isSafeInteger(offset) ||
        offset <= priorOffset ||
        offset > PHYSICAL_RENDER_LIMITS.maximumControlOffsetTicks ||
        typeof controlValue !== "number" ||
        !Number.isInteger(controlValue) ||
        controlValue < -0x8000_0000 ||
        controlValue > 0x7fff_ffff
      ) {
        return false;
      }
      priorOffset = offset;
    }
  }
  return totalPoints <= PHYSICAL_RENDER_LIMITS.maximumPointsPerGesture;
}

export type PhysicalGestureValidationResult =
  | Readonly<{ ok: true; value: ExpressiveVoiceGesture }>
  | Readonly<{
      ok: false;
      refusal: Readonly<{ code: PhysicalRenderRefusal["code"]; path: string }>;
    }>;

function gestureInvalid(
  code: PhysicalRenderRefusal["code"],
  path: string,
): PhysicalGestureValidationResult {
  return Object.freeze({ ok: false, refusal: Object.freeze({ code, path }) });
}

export type PhysicalPartitionCandidate = Readonly<{
  family: PhysicalInstrumentFamily;
  events: readonly Readonly<{
    eventId: string;
    voiceId: string;
    startTick: number;
    durationTicks: number;
    articulation: PhysicalArticulationId;
  }>[];
  declaredEventCount?: number;
  declaredCoupledVoiceCount?: number;
  handoffBytes?: number;
  sharedResonance?: boolean;
  pedalHeld?: boolean;
  loopRestart?: boolean;
}>;

export type PhysicalPartitionClassification = Readonly<{
  mode: PhysicalRenderMode;
  segments: number;
  stateContinues: boolean;
  canonicalResetReason: "loop-restart" | null;
  leakedPriorPassState: false;
}>;

export type PhysicalPartitionClassificationResult =
  | Readonly<{ ok: true; value: PhysicalPartitionClassification }>
  | Readonly<{ ok: false; refusal: Readonly<{ code: PhysicalRenderRefusal["code"] }> }>;

/** Classify an independently supplied phrase/stem before any PCM work. */
export function classifyPhysicalPartition(
  candidate: PhysicalPartitionCandidate,
): PhysicalPartitionClassificationResult {
  const declaredEvents = candidate.declaredEventCount ?? candidate.events.length;
  if (declaredEvents > PHYSICAL_RENDER_LIMITS.maximumEventsPerPhrase) {
    return Object.freeze({
      ok: false,
      refusal: Object.freeze({ code: "limit.physical_events_exceeded" }),
    });
  }
  const declaredVoices = candidate.declaredCoupledVoiceCount ??
    new Set(candidate.events.map(({ voiceId }) => voiceId)).size;
  if (declaredVoices > PHYSICAL_RENDER_LIMITS.maximumCoupledVoices) {
    return Object.freeze({
      ok: false,
      refusal: Object.freeze({ code: "limit.physical_voices_exceeded" }),
    });
  }
  if (
    (candidate.handoffBytes ?? 0) >
    PHYSICAL_RENDER_LIMITS.maximumStateHandoffBytes
  ) {
    return Object.freeze({
      ok: false,
      refusal: Object.freeze({ code: "physical.state_handoff_invalid" }),
    });
  }
  let priorStart = -1;
  for (const event of candidate.events) {
    if (
      !Number.isSafeInteger(event.startTick) ||
      !Number.isSafeInteger(event.durationTicks) ||
      event.startTick < priorStart ||
      event.durationTicks <= 0
    ) {
      return Object.freeze({
        ok: false,
        refusal: Object.freeze({ code: "physical.partition_invalid" }),
      });
    }
    priorStart = event.startTick;
  }
  const independent =
    candidate.family === "guitar" &&
    candidate.sharedResonance === false &&
    candidate.events.every(({ articulation }) => articulation === "palm-muted");
  const mode: PhysicalRenderMode = independent
    ? "independent-note"
    : candidate.family === "guitar" || candidate.family === "vibraphone"
      ? "coupled-stem"
      : "stateful-phrase";
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      mode,
      segments: candidate.events.length === 0 ? 0 : 1,
      stateContinues: mode !== "independent-note",
      canonicalResetReason: candidate.loopRestart === true ? "loop-restart" : null,
      leakedPriorPassState: false,
    }),
  });
}

/** Exact, ordered diagnostic surface for hostile serialized gestures. */
export function validateExpressiveVoiceGesture(
  value: unknown,
  path = "/gestures/0",
): PhysicalGestureValidationResult {
  if (!isRecord(value)) return gestureInvalid("physical.gesture_invalid", path);
  const family = value["instrumentFamily"];
  const articulation = value["articulation"];
  if (
    !PHYSICAL_INSTRUMENT_FAMILIES.some((candidate) => candidate === family) ||
    !PHYSICAL_ARTICULATION_IDS.some((candidate) => candidate === articulation)
  ) {
    return gestureInvalid("physical.gesture_invalid", path);
  }
  const declaredCurves = value["declaredCurveCount"];
  if (
    typeof declaredCurves === "number" &&
    declaredCurves > PHYSICAL_RENDER_LIMITS.maximumCurvesPerGesture
  ) {
    return gestureInvalid("limit.physical_curves_exceeded", `${path}/curves`);
  }
  const declaredPoints = value["declaredPointCount"];
  if (
    typeof declaredPoints === "number" &&
    declaredPoints > PHYSICAL_RENDER_LIMITS.maximumPointsPerGesture
  ) {
    return gestureInvalid(
      "limit.physical_control_points_exceeded",
      `${path}/curves`,
    );
  }
  const curves = value["curves"];
  if (!Array.isArray(curves) || curves.length === 0) {
    return gestureInvalid("physical.gesture_invalid", `${path}/curves`);
  }
  if (curves.length > PHYSICAL_RENDER_LIMITS.maximumCurvesPerGesture) {
    return gestureInvalid("limit.physical_curves_exceeded", `${path}/curves`);
  }
  const owned = CONTROL_OWNERSHIP[family as PhysicalInstrumentFamily];
  let totalPoints = 0;
  for (const [curveIndex, candidate] of curves.entries()) {
    const curvePath = `${path}/curves/${String(curveIndex)}`;
    if (!isRecord(candidate)) {
      return gestureInvalid("physical.gesture_invalid", curvePath);
    }
    const controlId = candidate["controlId"];
    if (!owned.some((ownedId) => ownedId === controlId)) {
      return gestureInvalid(
        "physical.control_unsupported",
        `${curvePath}/controlId`,
      );
    }
    const points = candidate["points"];
    if (!Array.isArray(points) || points.length === 0) {
      return gestureInvalid("physical.gesture_invalid", `${curvePath}/points`);
    }
    totalPoints += points.length;
    if (totalPoints > PHYSICAL_RENDER_LIMITS.maximumPointsPerGesture) {
      return gestureInvalid(
        "limit.physical_control_points_exceeded",
        `${path}/curves`,
      );
    }
    let priorOffset = -1;
    for (const [pointIndex, candidatePoint] of points.entries()) {
      const pointPath = `${curvePath}/points/${String(pointIndex)}`;
      if (!isRecord(candidatePoint)) {
        return gestureInvalid("physical.gesture_invalid", pointPath);
      }
      const offset = candidatePoint["offsetTicks"];
      const controlValue = candidatePoint["valueQ16_16"];
      if (
        typeof offset !== "number" ||
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset > PHYSICAL_RENDER_LIMITS.maximumControlOffsetTicks ||
        typeof controlValue !== "number" ||
        !Number.isInteger(controlValue) ||
        controlValue < -0x8000_0000 ||
        controlValue > 0x7fff_ffff
      ) {
        return gestureInvalid(
          "physical.control_value_out_of_range",
          `${pointPath}/offsetTicks`,
        );
      }
      if (offset === priorOffset) {
        return gestureInvalid(
          "physical.control_points_duplicate",
          `${pointPath}/offsetTicks`,
        );
      }
      if (offset < priorOffset) {
        return gestureInvalid(
          "physical.control_points_unsorted",
          `${pointPath}/offsetTicks`,
        );
      }
      priorOffset = offset;
    }
  }
  if (!isExpressiveVoiceGesture(value)) {
    return gestureInvalid("physical.gesture_invalid", path);
  }
  return Object.freeze({ ok: true, value });
}

function attackTicks(event: PlaybackEvent): number {
  return Math.max(1, Math.min(96, Math.floor(event.gateDurationTicks / 8)));
}

function articulationFor(
  family: PhysicalInstrumentFamily,
  event: PlaybackEvent,
  pitchOrdinal: number,
  previousEndTick: number | undefined,
): PhysicalArticulationId {
  if (family === "guitar") {
    return (event.ordinal + pitchOrdinal) % 2 === 0 ? "pick-down" : "pick-up";
  }
  if (family === "vibraphone") return "mallet-strike";
  if (
    previousEndTick !== undefined &&
    event.startTick <= previousEndTick + RELEASE_JOIN_TICKS
  ) {
    return "legato";
  }
  return family === "flute" ? "breath-attack" : "tongued";
}

function curvesFor(
  family: PhysicalInstrumentFamily,
  event: PlaybackEvent,
  articulation: PhysicalArticulationId,
  pitchOrdinal: number,
): readonly QuantizedPhysicalControlCurve[] {
  const attack = attackTicks(event);
  const duration = Math.max(attack, event.gateDurationTicks);
  const pressure = pressureForVelocity(event.velocity);
  if (family === "clarinet") {
    return Object.freeze([
      curve("air.pressure", "linear", [
        point(0, articulation === "legato" ? pressure * 0.88 : 0),
        point(attack, pressure),
        point(duration, pressure * 0.82),
      ]),
      curve("tongue.contact", "step", [
        point(0, articulation === "legato" ? 0 : 1),
        point(attack, 0),
      ]),
      curve("reed.stiffness", "step", [point(0, 0.58)]),
      curve("reed.opening", "step", [point(0, 0.46)]),
    ]);
  }
  if (family === "flute") {
    return Object.freeze([
      curve("air.pressure", "monotone-cubic", [
        point(0, articulation === "legato" ? pressure * 0.9 : 0),
        point(attack, pressure),
        point(duration, pressure * 0.78),
      ]),
      curve("air.turbulence", "linear", [
        point(0, articulation === "legato" ? 0.04 : 0.16),
        point(attack, 0.035 + event.velocity / 3_000),
      ]),
      curve("embouchure.offset", "step", [point(0, 0)]),
      curve("embouchure.jet-delay", "step", [point(0, 1)]),
    ]);
  }
  if (family === "trumpet") {
    return Object.freeze([
      curve("air.pressure", "linear", [
        point(0, articulation === "legato" ? pressure * 0.86 : 0),
        point(attack, pressure),
        point(duration, pressure * 0.86),
      ]),
      curve("tongue.contact", "step", [
        point(0, articulation === "legato" ? 0 : 1),
        point(attack, 0),
      ]),
      curve("lip.resonance", "linear", [
        point(0, 1),
        point(duration, 1 + event.velocity / 6_350),
      ]),
      curve("lip.aperture", "step", [point(0, 0.42)]),
    ]);
  }
  if (family === "guitar") {
    const direction = articulation === "pick-up" ? -1 : 1;
    return Object.freeze([
      curve("pick.position", "step", [point(0, 0.16 + pitchOrdinal * 0.005)]),
      curve("pick.hardness", "step", [point(0, 0.35 + event.velocity / 254)]),
      curve("pick.direction", "step", [point(0, direction)]),
      curve("string.damping", "linear", [point(0, 0.02), point(duration, 0.12)]),
    ]);
  }
  return Object.freeze([
    curve("mallet.hardness", "step", [point(0, 0.22 + event.velocity / 180)]),
    curve("strike.position", "step", [point(0, 0.43)]),
    curve("pedal.position", "step", [point(0, 1)]),
    curve("fan.rate", "step", [point(0, 0.5)]),
    curve("fan.phase", "step", [point(0, (event.ordinal % 8) / 8)]),
  ]);
}

function ticksToFrames(ticks: number, sampleRateHz: number, tempoBpm: number): number {
  const denominator = tempoBpm * 960;
  const numerator = ticks * sampleRateHz * 60;
  return Math.floor((numerator + denominator / 2) / denominator);
}

function planFingerprint(plan: PlaybackPlan): string {
  return sha256Hex(
    [
      plan.sourceDocumentId,
      plan.compilerId,
      String(plan.compilerVersion),
      String(plan.tempoBpm),
      String(plan.totalTicks),
      ...plan.events.flatMap((event) => [
        event.eventId,
        String(event.ordinal),
        String(event.startTick),
        String(event.gateDurationTicks),
        event.midiPitches.join(","),
        String(event.velocity),
      ]),
    ].join("\u001f"),
  );
}

function voiceIdFor(
  documentId: string,
  family: PhysicalInstrumentFamily,
  pitchOrdinal: number,
): string {
  return `physical.${family}.${sha256Hex(`${documentId}\u001f${String(pitchOrdinal)}`).slice(0, 24)}`;
}

function segmentMode(family: PhysicalInstrumentFamily): PhysicalRenderMode {
  if (family === "clarinet" || family === "flute" || family === "trumpet") {
    return "stateful-phrase";
  }
  return "coupled-stem";
}

function renderEvent(
  event: ExpandedVoiceEvent,
  timelineStartFrame: number,
): PhysicalRenderEvent {
  return Object.freeze({
    eventId: event.source.eventId,
    voiceId: event.voiceId,
    midiPitch: event.midiPitch,
    velocity: event.source.velocity,
    startFrame: event.startFrame - timelineStartFrame,
    durationFrames: event.durationFrames,
    gestureIndex: event.gestureIndex,
  });
}

function gestureFingerprintAt(
  gestures: readonly ExpressiveVoiceGesture[],
  index: number,
): string {
  const gesture = gestures[index];
  if (gesture === undefined) throw new Error("PHYSICAL_GESTURE_INDEX_INVALID");
  return physicalGestureFingerprint(gesture);
}

function makeSegment(
  request: CompilePhysicalRealizationRequest,
  mode: PhysicalRenderMode,
  ordinal: number,
  events: readonly ExpandedVoiceEvent[],
  gestures: readonly ExpressiveVoiceGesture[],
  previousSegmentId: string | null,
): PhysicalRenderSegment {
  const timelineStartFrame = Math.min(...events.map((event) => event.startFrame));
  const endFrame = Math.max(...events.map((event) => event.endFrame));
  const renderedEvents = Object.freeze(
    events.map((event) => renderEvent(event, timelineStartFrame)),
  );
  const identity = [
    mode,
    request.instrumentVersionId,
    request.parameterPackSha256,
    String(request.sampleRateHz),
    String(timelineStartFrame),
    ...renderedEvents.flatMap((event) => [
      event.eventId,
      event.voiceId,
      String(event.midiPitch),
      String(event.velocity),
      String(event.startFrame),
      String(event.durationFrames),
      String(event.gestureIndex),
      gestureFingerprintAt(gestures, event.gestureIndex),
    ]),
  ].join("\u001f");
  const cacheFingerprint = sha256Hex(identity);
  const segmentId = `physical.segment.${String(ordinal)}.${cacheFingerprint.slice(0, 20)}`;
  return Object.freeze({
    segmentId,
    mode,
    rendererVersionId: request.instrumentVersionId,
    parameterPackSha256: request.parameterPackSha256,
    sampleRateHz: request.sampleRateHz,
    timelineStartFrame,
    frameCount: endFrame - timelineStartFrame,
    cacheFingerprint,
    events: renderedEvents,
    stateInputFromSegmentId: previousSegmentId,
    stateInputSha256: null,
    stateOutputExpected: true,
  });
}

function partition(
  request: CompilePhysicalRealizationRequest,
  expanded: readonly ExpandedVoiceEvent[],
  gestures: readonly ExpressiveVoiceGesture[],
  work: MutableWork,
): readonly PhysicalRenderSegment[] {
  const mode = segmentMode(request.instrumentFamily);
  const maximumFrames = Math.min(
    PHYSICAL_RENDER_LIMITS.maximumOutputFrames,
    request.sampleRateHz * (
      mode === "stateful-phrase"
        ? PHYSICAL_RENDER_LIMITS.maximumPhraseSeconds
        : PHYSICAL_RENDER_LIMITS.maximumStemSeconds
    ),
  );
  const groups = new Map<string, ExpandedVoiceEvent[]>();
  if (mode === "stateful-phrase") {
    for (const event of expanded) {
      const group = groups.get(event.voiceId) ?? [];
      group.push(event);
      groups.set(event.voiceId, group);
    }
  } else {
    groups.set("coupled", [...expanded]);
  }
  const segments: PhysicalRenderSegment[] = [];
  let previousSegmentId: string | null = null;
  for (const group of groups.values()) {
    group.sort((left, right) =>
      left.startFrame - right.startFrame ||
      left.source.ordinal - right.source.ordinal ||
      left.midiPitch - right.midiPitch,
    );
    let chunk: ExpandedVoiceEvent[] = [];
    for (const event of group) {
      const chunkStart = chunk[0]?.startFrame ?? event.startFrame;
      const eventLimit = mode === "stateful-phrase"
        ? PHYSICAL_RENDER_LIMITS.maximumEventsPerPhrase
        : PHYSICAL_RENDER_LIMITS.maximumEventsPerStem;
      const disconnected =
        mode === "stateful-phrase" &&
        chunk.length > 0 &&
        event.articulation !== "legato";
      if (
        chunk.length >= eventLimit ||
        event.endFrame - chunkStart > maximumFrames ||
        disconnected
      ) {
        const segment = makeSegment(
          request,
          mode,
          segments.length,
          chunk,
          gestures,
          previousSegmentId,
        );
        segments.push(segment);
        previousSegmentId = segment.segmentId;
        chunk = [];
      }
      chunk.push(event);
    }
    if (chunk.length > 0) {
      const segment = makeSegment(
        request,
        mode,
        segments.length,
        chunk,
        gestures,
        previousSegmentId,
      );
      segments.push(segment);
      previousSegmentId = segment.segmentId;
    }
    previousSegmentId = null;
  }
  work.segmentsCreated = segments.length;
  return Object.freeze(segments);
}

export function compilePhysicalRealization(
  request: CompilePhysicalRealizationRequest,
): PhysicalRenderResult<CompiledPhysicalRealization> {
  const work = emptyWork();
  if (
    !Number.isSafeInteger(request.sourcePlanRevision) ||
    request.sourcePlanRevision < 0
  ) {
    return refuse(work, "physical.request_invalid", "/sourcePlanRevision", "Revision must be a nonnegative safe integer");
  }
  if (!ID_PATTERN.test(request.instrumentVersionId)) {
    return refuse(work, "physical.instrument_unsupported", "/instrumentVersionId", "Instrument version ID is invalid");
  }
  if (!SHA256_PATTERN.test(request.parameterPackSha256)) {
    return refuse(work, "physical.parameter_pack_hash_mismatch", "/parameterPackSha256", "Parameter-pack identity must be lowercase SHA-256");
  }
  if (!PHYSICAL_RENDER_LIMITS.supportedSampleRatesHz.includes(request.sampleRateHz)) {
    return refuse(work, "physical.sample_rate_unsupported", "/sampleRateHz", "Sample rate is outside the v2 set");
  }

  const fingerprint = planFingerprint(request.plan);
  const previousEndByVoice = new Map<string, number>();
  const gestures: ExpressiveVoiceGesture[] = [];
  const expanded: ExpandedVoiceEvent[] = [];
  for (const event of request.plan.events) {
    work.eventsVisited += 1;
    for (const [pitchOrdinal, midiPitch] of event.midiPitches.entries()) {
      const voiceId = voiceIdFor(
        request.plan.sourceDocumentId,
        request.instrumentFamily,
        pitchOrdinal,
      );
      const articulation = articulationFor(
        request.instrumentFamily,
        event,
        pitchOrdinal,
        previousEndByVoice.get(voiceId),
      );
      const curves = curvesFor(
        request.instrumentFamily,
        event,
        articulation,
        pitchOrdinal,
      );
      work.curvesVisited += curves.length;
      work.controlPointsVisited += curves.reduce(
        (total, controlCurve) => total + controlCurve.points.length,
        0,
      );
      const seedMaterial = [
        request.plan.sourceDocumentId,
        event.eventId,
        voiceId,
        request.instrumentVersionId,
        articulation,
      ].join("\u001f");
      const gestureIndex = gestures.length;
      gestures.push(
        Object.freeze({
          eventId: event.eventId,
          voiceId,
          instrumentFamily: request.instrumentFamily,
          instrumentVersionId: request.instrumentVersionId,
          articulation,
          deterministicSeedUint32: sha256LowUint32(seedMaterial),
          curves,
        }),
      );
      work.gesturesValidated += 1;
      const startFrame = ticksToFrames(
        event.startTick,
        request.sampleRateHz,
        request.plan.tempoBpm,
      );
      const durationFrames = Math.max(
        1,
        ticksToFrames(
          event.gateDurationTicks,
          request.sampleRateHz,
          request.plan.tempoBpm,
        ),
      );
      expanded.push(
        Object.freeze({
          source: event,
          gestureIndex,
          voiceId,
          midiPitch,
          startFrame,
          durationFrames,
          endFrame: startFrame + durationFrames,
          articulation,
        }),
      );
      previousEndByVoice.set(voiceId, event.startTick + event.gateDurationTicks);
    }
  }
  work.voicesAllocated = new Set(expanded.map((event) => event.voiceId)).size;
  if (work.voicesAllocated > PHYSICAL_RENDER_LIMITS.maximumCoupledVoices) {
    return refuse(
      work,
      "limit.physical_voices_exceeded",
      "/plan/events/*/midiPitches",
      "Physical voice allocation exceeds the shared v2 bound",
    );
  }
  const segments = partition(request, expanded, gestures, work);
  // Compilation schedules work but does not render PCM. The renderer alone may
  // increment this counter; reporting planned frames here would manufacture
  // execution evidence that did not happen.
  work.framesRendered = 0;
  const expressivePlan: ExpressiveRealizationPlan = Object.freeze({
    schema: EXPRESSIVE_REALIZATION_PLAN_SCHEMA,
    sourceDocumentId: request.plan.sourceDocumentId,
    sourcePlanRevision: request.sourcePlanRevision,
    playbackPlanFingerprint: fingerprint,
    policyVersionId: "changes.audio.expressive-policy.v1",
    gestures: Object.freeze(gestures),
  });
  const renderPlan: PhysicalRenderPlan = Object.freeze({
    schema: PHYSICAL_RENDER_PLAN_SCHEMA,
    sourceDocumentId: request.plan.sourceDocumentId,
    sourcePlanRevision: request.sourcePlanRevision,
    segments,
    work: freezeWork(work),
  });
  return Object.freeze({
    ok: true,
    value: Object.freeze({ expressivePlan, renderPlan }),
  });
}

export { CONTROL_OWNERSHIP as PHYSICAL_CONTROL_OWNERSHIP };
