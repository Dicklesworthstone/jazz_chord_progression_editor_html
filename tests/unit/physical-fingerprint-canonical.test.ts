import { describe, expect, test } from "bun:test";

import {
  compilePhysicalRealization,
  physicalGestureFingerprint,
  sha256Hex,
} from "../../src/audio";
import type { ExpressiveVoiceGesture } from "../../src/audio";
import { compilePlaybackPlan, type PlaybackPlan } from "../../src/playback";
import { materializeP0TimelineCase } from "../support/p0-playback-fixtures";

const PACK_SHA256 = "a".repeat(64);

function productionPlan(): PlaybackPlan {
  const compiled = compilePlaybackPlan(
    materializeP0TimelineCase("P0-TIME-001").request,
  );
  if (!compiled.ok) {
    throw new Error(`FINGERPRINT_TEST_PLAYBACK:${compiled.refusal.code}`);
  }
  return compiled.plan;
}

function compileGuitar() {
  const result = compilePhysicalRealization({
    plan: productionPlan(),
    sourcePlanRevision: 17,
    instrumentFamily: "guitar",
    instrumentVersionId: "changes.physical.guitar.v2",
    parameterPackSha256: PACK_SHA256,
    sampleRateHz: 48_000,
  });
  if (!result.ok) throw new Error("FINGERPRINT_TEST_COMPILE_REFUSED");
  return result.value;
}

/**
 * The legacy pre-canonical serialization: a flat U+001F join in which curve
 * and point boundaries were implied by token shapes instead of explicit
 * framing. Reimplemented here as the collision witness.
 */
function legacyFlatText(gesture: ExpressiveVoiceGesture): string {
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
  ].join("");
}

function gestureWithCurves(
  curves: readonly {
    controlId: string;
    interpolation: string;
    points: readonly { offsetTicks: number | string; valueQ16_16: number | string }[];
  }[],
): ExpressiveVoiceGesture {
  return {
    schemaVersion: "phs0.gesture.v1",
    eventId: "evt-collision",
    voiceId: "physical.guitar.abc",
    instrumentFamily: "guitar",
    instrumentVersionId: "changes.physical.guitar.v2",
    articulation: "pick-down",
    deterministicSeedUint32: 7,
    curves,
  } as unknown as ExpressiveVoiceGesture;
}

describe("canonical physical fingerprint serialization", () => {
  test("structures that collided under the legacy flat join are distinguished", () => {
    // A: one curve owning both numeric tokens as a point.
    const gestureA = gestureWithCurves([
      {
        controlId: "pick.position",
        interpolation: "step",
        points: [{ offsetTicks: 0, valueQ16_16: 65536 }],
      },
      { controlId: "string.damping", interpolation: "step", points: [] },
    ]);
    // B: an empty first curve; the same tokens re-parsed as a second curve
    // whose control-ID and interpolation happen to be numeric strings.
    const gestureB = gestureWithCurves([
      { controlId: "pick.position", interpolation: "step", points: [] },
      {
        controlId: "0",
        interpolation: "65536",
        points: [{ offsetTicks: "string.damping", valueQ16_16: "step" }],
      },
    ]);

    // Witness: the legacy flat join could not tell these structures apart.
    expect(legacyFlatText(gestureA)).toBe(legacyFlatText(gestureB));
    expect(sha256Hex(legacyFlatText(gestureA))).toBe(
      sha256Hex(legacyFlatText(gestureB)),
    );

    // The canonical framing distinguishes them.
    expect(physicalGestureFingerprint(gestureA)).not.toBe(
      physicalGestureFingerprint(gestureB),
    );
  });

  test("fingerprints are stable for identical content and hex-shaped", () => {
    const gesture = gestureWithCurves([
      {
        controlId: "pick.position",
        interpolation: "step",
        points: [{ offsetTicks: 3, valueQ16_16: 1234 }],
      },
    ]);
    const clone = gestureWithCurves([
      {
        controlId: "pick.position",
        interpolation: "step",
        points: [{ offsetTicks: 3, valueQ16_16: 1234 }],
      },
    ]);
    expect(physicalGestureFingerprint(gesture)).toBe(
      physicalGestureFingerprint(clone),
    );
    expect(physicalGestureFingerprint(gesture)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("every render-affecting gesture field changes the fingerprint", () => {
    const base = gestureWithCurves([
      {
        controlId: "pick.position",
        interpolation: "step",
        points: [{ offsetTicks: 3, valueQ16_16: 1234 }],
      },
    ]);
    const baseline = physicalGestureFingerprint(base);
    const mutate = (patch: Record<string, unknown>): string =>
      physicalGestureFingerprint({
        ...(base as unknown as Record<string, unknown>),
        ...patch,
      } as unknown as ExpressiveVoiceGesture);

    expect(mutate({ eventId: "evt-other" })).not.toBe(baseline);
    expect(mutate({ voiceId: "physical.guitar.zzz" })).not.toBe(baseline);
    expect(mutate({ instrumentFamily: "clarinet" })).not.toBe(baseline);
    expect(
      mutate({ instrumentVersionId: "changes.physical.guitar.v3" }),
    ).not.toBe(baseline);
    expect(mutate({ articulation: "pick-up" })).not.toBe(baseline);
    expect(mutate({ deterministicSeedUint32: 8 })).not.toBe(baseline);
    expect(
      physicalGestureFingerprint(
        gestureWithCurves([
          {
            controlId: "pick.position",
            interpolation: "linear",
            points: [{ offsetTicks: 3, valueQ16_16: 1234 }],
          },
        ]),
      ),
    ).not.toBe(baseline);
    expect(
      physicalGestureFingerprint(
        gestureWithCurves([
          {
            controlId: "pick.position",
            interpolation: "step",
            points: [{ offsetTicks: 4, valueQ16_16: 1234 }],
          },
        ]),
      ),
    ).not.toBe(baseline);
    expect(
      physicalGestureFingerprint(
        gestureWithCurves([
          {
            controlId: "pick.position",
            interpolation: "step",
            points: [{ offsetTicks: 3, valueQ16_16: 1235 }],
          },
        ]),
      ),
    ).not.toBe(baseline);
    expect(
      physicalGestureFingerprint(
        gestureWithCurves([
          {
            controlId: "pick.position",
            interpolation: "step",
            points: [{ offsetTicks: 3, valueQ16_16: 1234 }],
          },
          { controlId: "string.damping", interpolation: "step", points: [] },
        ]),
      ),
    ).not.toBe(baseline);
  });

  test("segment cache fingerprints stay deterministic and sensitive through the production compiler", () => {
    const first = compileGuitar();
    const repeated = compileGuitar();
    expect(
      first.renderPlan.segments.map(({ cacheFingerprint }) => cacheFingerprint),
    ).toEqual(
      repeated.renderPlan.segments.map(
        ({ cacheFingerprint }) => cacheFingerprint,
      ),
    );
    for (const segment of first.renderPlan.segments) {
      expect(segment.cacheFingerprint).toMatch(/^[0-9a-f]{64}$/);
    }

    const otherVersion = compilePhysicalRealization({
      plan: productionPlan(),
      sourcePlanRevision: 17,
      instrumentFamily: "guitar",
      instrumentVersionId: "changes.physical.guitar.v3",
      parameterPackSha256: PACK_SHA256,
      sampleRateHz: 48_000,
    });
    if (!otherVersion.ok) throw new Error("FINGERPRINT_TEST_COMPILE_REFUSED");
    expect(otherVersion.value.renderPlan.segments[0]?.cacheFingerprint).not.toBe(
      first.renderPlan.segments[0]?.cacheFingerprint,
    );
  });
});
