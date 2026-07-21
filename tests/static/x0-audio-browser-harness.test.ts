import { describe, expect, test } from "bun:test";

import { x0FirstFrameAtOrAfter } from "../../src/test-support/x0-audio-browser-harness";

describe("X0 reviewed browser measurement frame boundaries", () => {
  test("uses the first frame at or after each half-open 44.1 kHz boundary", () => {
    const sampleRate = 44_100;
    const frameCount = sampleRate * 5;

    expect(1.1 * sampleRate).toBeGreaterThan(48_510);
    expect(x0FirstFrameAtOrAfter(0.1, sampleRate, frameCount)).toBe(4_410);
    expect(x0FirstFrameAtOrAfter(1.1, sampleRate, frameCount)).toBe(48_510);

    const activeEnd = x0FirstFrameAtOrAfter(1.1, sampleRate, frameCount);
    const earlyTailStart = x0FirstFrameAtOrAfter(
      1.1,
      sampleRate,
      frameCount,
    );
    expect(activeEnd).toBe(earlyTailStart);
  });

  test("advances only when the requested time is strictly after a frame", () => {
    const sampleRate = 48_000;
    const frameCount = sampleRate * 4;
    const exactFrameTime = 4_800 / sampleRate;

    expect(x0FirstFrameAtOrAfter(exactFrameTime, sampleRate, frameCount)).toBe(
      4_800,
    );
    expect(
      x0FirstFrameAtOrAfter(
        exactFrameTime + Number.EPSILON,
        sampleRate,
        frameCount,
      ),
    ).toBe(4_801);
  });

  test("clamps boundaries to the rendered frame domain", () => {
    expect(x0FirstFrameAtOrAfter(-1, 96_000, 12_345)).toBe(0);
    expect(x0FirstFrameAtOrAfter(10, 96_000, 12_345)).toBe(12_345);
  });
});
