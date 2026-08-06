import { expect, test } from "bun:test";

import { loadConcertGrandRenderer } from "../../src/audio/dsp-renderer";

test("the shared Rust modal component preserves state exactly across partitions", async () => {
  const renderer = await loadConcertGrandRenderer();
  const request = {
    sampleRateHz: 48_000 as const,
    frequencyHz: 440,
    dampingPerSecond: 2.5,
    excitation: 0.5,
    initialState: { x: 0, y: 0 },
    frameCount: 4_096,
  };
  const whole = renderer.renderPhysicalModalV2(request);
  const first = renderer.renderPhysicalModalV2({ ...request, frameCount: 1_024 });
  if (whole === null || first === null) throw new Error("PHYSICAL_MODAL_REFUSED");
  const second = renderer.renderPhysicalModalV2({
    ...request,
    excitation: 0,
    initialState: first.state,
    frameCount: 3_072,
  });
  if (second === null) throw new Error("PHYSICAL_MODAL_HANDOFF_REFUSED");

  expect(Array.from(whole.left.slice(0, 1_024))).toEqual(Array.from(first.left));
  expect(Array.from(whole.left.slice(1_024))).toEqual(Array.from(second.left));
  expect(whole.state).toEqual(second.state);
  expect(Math.abs(whole.energy.residual)).toBeLessThan(1e-14);
  expect(Math.abs(first.energy.residual)).toBeLessThan(1e-14);
  expect(Math.abs(second.energy.residual)).toBeLessThan(1e-14);
  expect(second.energy.finalEnergy).toBeLessThan(second.energy.initialEnergy);
});

test("the v2 mode preserves physical excitation scale instead of early-RMS normalization", async () => {
  const renderer = await loadConcertGrandRenderer();
  const common = {
    sampleRateHz: 48_000 as const,
    frequencyHz: 261.625565,
    dampingPerSecond: 1.2,
    initialState: { x: 0, y: 0 },
    frameCount: 2_048,
  };
  const soft = renderer.renderPhysicalModalV2({ ...common, excitation: 0.25 });
  const hard = renderer.renderPhysicalModalV2({ ...common, excitation: 0.5 });
  if (soft === null || hard === null) throw new Error("PHYSICAL_MODAL_REFUSED");

  for (let index = 0; index < soft.left.length; index += 137) {
    expect((hard.left[index] ?? 0) / (soft.left[index] ?? 1)).toBeCloseTo(2, 6);
  }
  expect(hard.energy.excitationWork / soft.energy.excitationWork).toBeCloseTo(4, 12);
  expect(soft.limiterEngagements).toBe(0);
  expect(hard.limiterEngagements).toBe(0);

  const guarded = renderer.renderPhysicalModalV2({ ...common, excitation: 4 });
  if (guarded === null) throw new Error("PHYSICAL_MODAL_GUARD_REFUSED");
  expect(guarded.limiterEngagements).toBe(1);
  expect(Math.max(...guarded.left.map(Math.abs))).toBeLessThanOrEqual(0.981);
});

test("the v2 mode refuses unsupported rate and frame bounds", async () => {
  const renderer = await loadConcertGrandRenderer();
  const baseline = {
    sampleRateHz: 48_000 as const,
    frequencyHz: 440,
    dampingPerSecond: 2,
    excitation: 0.5,
    initialState: { x: 0, y: 0 },
    frameCount: 256,
  };
  expect(renderer.renderPhysicalModalV2({ ...baseline, frameCount: 0 })).toBeNull();
  expect(
    renderer.renderPhysicalModalV2({
      ...baseline,
      sampleRateHz: 48_000,
      frequencyHz: 30_000,
    }),
  ).toBeNull();
});
