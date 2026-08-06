import { describe, expect, test } from "bun:test";

import gestureFixtureValue from "../fixtures/physical-renderer/gesture-cases.json";
import partitionFixtureValue from "../fixtures/physical-renderer/partition-cases.json";
import {
  classifyPhysicalPartition,
  compilePhysicalRealization,
  validateExpressiveVoiceGesture,
  type ExpressiveVoiceGesture,
  type PhysicalPartitionCandidate,
} from "../../src/audio";
import { compilePlaybackPlan, type PlaybackPlan } from "../../src/playback";
import { materializeP0TimelineCase } from "../support/p0-playback-fixtures";

type JsonRecord = Readonly<Record<string, unknown>>;

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`PHS0_CONFORMANCE_RECORD:${label}`);
  }
  return value as JsonRecord;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`PHS0_CONFORMANCE_STRING:${label}`);
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number") throw new Error(`PHS0_CONFORMANCE_NUMBER:${label}`);
  return value;
}

function materializeGesture(row: JsonRecord): unknown {
  const curves = row["curves"];
  if (!Array.isArray(curves)) throw new Error("PHS0_GESTURE_CURVES");
  return Object.freeze({
    eventId: `event-${string(row["id"], "gesture.id").toLowerCase()}`,
    voiceId: "physical.fixture.voice",
    instrumentFamily: row["family"],
    instrumentVersionId: "changes.physical.fixture.v2",
    articulation: row["articulation"],
    deterministicSeedUint32: 0x1234_5678,
    ...(row["declaredCurveCount"] === undefined
      ? {}
      : { declaredCurveCount: row["declaredCurveCount"] }),
    ...(row["declaredPointCount"] === undefined
      ? {}
      : { declaredPointCount: row["declaredPointCount"] }),
    curves: curves.map((curveValue) => {
      const curve = record(curveValue, "curve");
      const points = curve["points"];
      if (!Array.isArray(points)) throw new Error("PHS0_GESTURE_POINTS");
      return Object.freeze({
        controlId: curve["controlId"],
        interpolation: curve["interpolation"],
        points: points.map((pointValue) => {
          if (!Array.isArray(pointValue) || pointValue.length !== 2) {
            throw new Error("PHS0_GESTURE_POINT");
          }
          return Object.freeze({
            offsetTicks: pointValue[0],
            valueQ16_16: pointValue[1],
          });
        }),
      });
    }),
  });
}

describe("PHS0 independent fixture replay", () => {
  const gestureRoot = record(gestureFixtureValue, "gesture.root");
  const gestureCases = gestureRoot["cases"];
  if (!Array.isArray(gestureCases)) throw new Error("PHS0_GESTURE_CASES");
  for (const candidate of gestureCases) {
    const row = record(candidate, "gesture.case");
    test(`${string(row["id"], "gesture.id")} replays against production validation`, () => {
      const expected = record(row["expected"], "gesture.expected");
      const observed = validateExpressiveVoiceGesture(materializeGesture(row));
      if (expected["outcome"] === "accepted") {
        expect(observed.ok).toBe(true);
      } else {
        expect(observed.ok).toBe(false);
        if (observed.ok) throw new Error("PHS0_GESTURE_ACCEPTED");
        expect(observed.refusal.code).toBe(expected["code"]);
        expect(observed.refusal.path).toBe(expected["path"]);
      }
    });
  }

  const partitionRoot = record(partitionFixtureValue, "partition.root");
  const partitionCases = partitionRoot["cases"];
  if (!Array.isArray(partitionCases)) throw new Error("PHS0_PARTITION_CASES");
  for (const candidate of partitionCases) {
    const row = record(candidate, "partition.case");
    test(`${string(row["id"], "partition.id")} replays against production partition policy`, () => {
      const tuples = row["events"] ?? [];
      if (!Array.isArray(tuples)) throw new Error("PHS0_PARTITION_EVENTS");
      const materialized = {
        family: row["family"],
        events: tuples.map((tupleValue) => {
          if (!Array.isArray(tupleValue) || tupleValue.length !== 5) {
            throw new Error("PHS0_PARTITION_TUPLE");
          }
          return Object.freeze({
            eventId: string(tupleValue[0], "event.id"),
            voiceId: string(tupleValue[1], "voice.id"),
            startTick: number(tupleValue[2], "event.start"),
            durationTicks: number(tupleValue[3], "event.duration"),
            articulation: tupleValue[4],
          });
        }),
        ...(row["declaredEventCount"] === undefined ? {} : { declaredEventCount: row["declaredEventCount"] }),
        ...(row["declaredCoupledVoiceCount"] === undefined ? {} : { declaredCoupledVoiceCount: row["declaredCoupledVoiceCount"] }),
        ...(row["handoffBytes"] === undefined ? {} : { handoffBytes: row["handoffBytes"] }),
        ...(row["sharedResonance"] === undefined ? {} : { sharedResonance: row["sharedResonance"] }),
        ...(row["pedalHeld"] === undefined ? {} : { pedalHeld: row["pedalHeld"] }),
        ...(row["loopRestart"] === undefined ? {} : { loopRestart: row["loopRestart"] }),
      } as unknown as PhysicalPartitionCandidate;
      const observed = classifyPhysicalPartition(materialized);
      const expected = record(row["expected"], "partition.expected");
      if (expected["outcome"] === "refused") {
        expect(observed.ok).toBe(false);
        if (observed.ok) throw new Error("PHS0_PARTITION_ACCEPTED");
        expect(observed.refusal.code).toBe(expected["code"]);
        return;
      }
      expect(observed.ok).toBe(true);
      if (!observed.ok) throw new Error("PHS0_PARTITION_REFUSED");
      for (const field of [
        "mode",
        "segments",
        "stateContinues",
        "canonicalResetReason",
        "leakedPriorPassState",
      ] as const) {
        if (field in expected) expect(observed.value[field]).toBe(expected[field]);
      }
    });
  }
});

test("a pitch transposition changes render pitches but preserves physical control timing", () => {
  const playback = compilePlaybackPlan(materializeP0TimelineCase("P0-TIME-001").request);
  if (!playback.ok) throw new Error("PHS0_TRANSPOSE_PLAN");
  const transposed = Object.freeze({
    ...playback.plan,
    events: Object.freeze(playback.plan.events.map((event) => Object.freeze({
      ...event,
      midiPitches: Object.freeze(event.midiPitches.map((pitch) => pitch + 2)),
    }))),
  }) as unknown as PlaybackPlan;
  const compile = (plan: PlaybackPlan) => compilePhysicalRealization({
    plan,
    sourcePlanRevision: 1,
    instrumentFamily: "clarinet",
    instrumentVersionId: "changes.physical.clarinet.v2",
    parameterPackSha256: "d".repeat(64),
    sampleRateHz: 48_000,
  });
  const original = compile(playback.plan);
  const shifted = compile(transposed);
  if (!original.ok || !shifted.ok) throw new Error("PHS0_TRANSPOSE_REFUSED");
  expect(shifted.value.renderPlan.segments[0]?.events[0]?.midiPitch).toBe(
    (original.value.renderPlan.segments[0]?.events[0]?.midiPitch ?? 0) + 2,
  );
  const offsets = (gesture: ExpressiveVoiceGesture) =>
    gesture.curves.map((curve) => curve.points.map(({ offsetTicks }) => offsetTicks));
  expect(offsets(shifted.value.expressivePlan.gestures[0] as ExpressiveVoiceGesture)).toEqual(
    offsets(original.value.expressivePlan.gestures[0] as ExpressiveVoiceGesture),
  );
});
