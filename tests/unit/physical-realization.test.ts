import { describe, expect, test } from "bun:test";

import {
  compilePhysicalRealization,
  sha256Hex,
  sha256LowUint32,
} from "../../src/audio";
import { compilePlaybackPlan, type PlaybackPlan } from "../../src/playback";
import { materializeP0TimelineCase } from "../support/p0-playback-fixtures";

const PACK_SHA256 = "a".repeat(64);

function productionPlan(): PlaybackPlan {
  const compiled = compilePlaybackPlan(
    materializeP0TimelineCase("P0-TIME-001").request,
  );
  if (!compiled.ok) {
    throw new Error(`PHYSICAL_TEST_PLAYBACK:${compiled.refusal.code}`);
  }
  return compiled.plan;
}

function compileFamily(
  family: "clarinet" | "flute" | "guitar" | "trumpet" | "vibraphone",
) {
  return compilePhysicalRealization({
    plan: productionPlan(),
    sourcePlanRevision: 17,
    instrumentFamily: family,
    instrumentVersionId: `changes.physical.${family}.v2`,
    parameterPackSha256: PACK_SHA256,
    sampleRateHz: 48_000,
  });
}

describe("deterministic physical realization", () => {
  test("uses a browser-safe SHA-256 implementation with published vectors", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256LowUint32("abc").toString(16)).toBe("bf1678ba");
  });

  test("turns a production playback plan into frozen clarinet gestures and stateful phrases", () => {
    const first = compileFamily("clarinet");
    const repeated = compileFamily("clarinet");
    if (!first.ok || !repeated.ok) throw new Error("PHYSICAL_CLARINET_REFUSED");

    expect(first.value).toEqual(repeated.value);
    expect(first.value.expressivePlan.playbackPlanFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(first.value.expressivePlan.gestures.length).toBeGreaterThan(0);
    expect(first.value.renderPlan.segments.length).toBeGreaterThan(0);
    expect(first.value.renderPlan.segments.every(({ mode }) => mode === "stateful-phrase")).toBe(true);

    const firstVoice = first.value.expressivePlan.gestures.filter(
      ({ voiceId }) => voiceId === first.value.expressivePlan.gestures[0]?.voiceId,
    );
    expect(firstVoice.slice(0, 3).map(({ articulation }) => articulation)).toEqual([
      "tongued",
      "legato",
      "legato",
    ]);
    expect(firstVoice.at(-1)?.articulation).toBe("legato");

    const firstGesture = first.value.expressivePlan.gestures[0];
    expect(firstGesture?.curves.map(({ controlId }) => controlId)).toEqual([
      "air.pressure",
      "tongue.contact",
      "reed.stiffness",
      "reed.opening",
    ]);
    expect(Object.isFrozen(first.value)).toBe(true);
    expect(Object.isFrozen(first.value.expressivePlan.gestures)).toBe(true);
    expect(Object.isFrozen(firstGesture?.curves[0]?.points)).toBe(true);
    expect(first.value.renderPlan.work.framesRendered).toBe(0);
  });

  test("a real timeline gap is a near-miss that starts a new physical phrase", () => {
    const result = compileFamily("flute");
    if (!result.ok) throw new Error("PHYSICAL_FLUTE_REFUSED");
    const firstVoice = result.value.expressivePlan.gestures.filter(
      ({ voiceId }) => voiceId === result.value.expressivePlan.gestures[0]?.voiceId,
    );

    expect(firstVoice.map(({ articulation }) => articulation)).toEqual([
      "breath-attack",
      "legato",
      "legato",
      "legato",
      "breath-attack",
      "legato",
    ]);
    const segmentStarts = result.value.renderPlan.segments
      .filter(({ events }) => events[0]?.voiceId === firstVoice[0]?.voiceId)
      .map(({ events }) => events[0]?.eventId);
    expect(segmentStarts).toEqual(["event-p0-a1-1", "event-p0-a3-1"]);
  });

  test("guitar and vibraphone preserve simultaneous interactions in coupled stems", () => {
    const guitar = compileFamily("guitar");
    const vibes = compileFamily("vibraphone");
    if (!guitar.ok || !vibes.ok) throw new Error("PHYSICAL_STEM_REFUSED");

    expect(guitar.value.renderPlan.segments.every(({ mode }) => mode === "coupled-stem")).toBe(true);
    expect(guitar.value.renderPlan.segments[0]?.events.length).toBe(
      guitar.value.expressivePlan.gestures.length,
    );
    expect(
      guitar.value.expressivePlan.gestures.slice(0, 4).map(({ articulation }) => articulation),
    ).toEqual(["pick-down", "pick-up", "pick-down", "pick-up"]);
    expect(
      vibes.value.expressivePlan.gestures[0]?.curves.map(({ controlId }) => controlId),
    ).toEqual([
      "mallet.hardness",
      "strike.position",
      "pedal.position",
      "fan.rate",
      "fan.phase",
    ]);
  });

  test("refuses invalid renderer identity before visiting musical events", () => {
    const result = compilePhysicalRealization({
      plan: productionPlan(),
      sourcePlanRevision: 0,
      instrumentFamily: "trumpet",
      instrumentVersionId: "changes.physical.trumpet.v2",
      parameterPackSha256: "NOT-A-HASH",
      sampleRateHz: 48_000,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("PHYSICAL_HASH_ACCEPTED");
    expect(result.refusal.code).toBe("physical.parameter_pack_hash_mismatch");
    expect(result.refusal.path).toBe("/parameterPackSha256");
    expect(result.refusal.work.eventsVisited).toBe(0);
    expect(result.refusal.work.diagnosticsPublished).toBe(1);
  });
});
