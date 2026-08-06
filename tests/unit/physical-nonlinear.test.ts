import { expect, test } from "bun:test";

import { loadConcertGrandRenderer } from "../../src/audio/dsp-renderer";

function residual(
  pressure: number,
  request: Readonly<{
    mouthPressure: number;
    borePressure: number;
    opening: number;
    stiffness: number;
    boreImpedance: number;
  }>,
): number {
  const delta = Math.max(0, request.mouthPressure - pressure);
  const aperture = Math.max(0, request.opening - request.stiffness * delta);
  const flow = aperture * Math.sqrt(delta);
  return pressure - request.borePressure - request.boreImpedance * flow;
}

test("the shared reed solve is deterministic, bounded, and satisfies pressure-flow coupling", async () => {
  const renderer = await loadConcertGrandRenderer();
  const request = {
    mouthPressure: 0.9,
    borePressure: -0.1,
    opening: 0.7,
    stiffness: 0.3,
    boreImpedance: 0.8,
  };
  const first = renderer.solvePhysicalReedV2(request);
  const repeated = renderer.solvePhysicalReedV2(request);
  if (first === null || repeated === null) throw new Error("PHYSICAL_REED_REFUSED");

  expect(first).toEqual(repeated);
  expect(first.nonlinearIterations).toBeLessThanOrEqual(8);
  expect(first.fallbackBisections).toBeLessThanOrEqual(16);
  expect(Math.abs(residual(first.junctionPressure, request))).toBeLessThan(1e-9);
  expect(first.volumeFlow).toBeGreaterThan(0);
});

test("reed opening has a physical positive capability and invalid brackets refuse", async () => {
  const renderer = await loadConcertGrandRenderer();
  const common = {
    mouthPressure: 0.8,
    borePressure: 0.1,
    stiffness: 0.35,
    boreImpedance: 0.9,
  };
  const narrow = renderer.solvePhysicalReedV2({ ...common, opening: 0.45 });
  const open = renderer.solvePhysicalReedV2({ ...common, opening: 0.75 });
  if (narrow === null || open === null) throw new Error("PHYSICAL_REED_REFUSED");
  expect(open.volumeFlow).toBeGreaterThan(narrow.volumeFlow);
  expect(
    renderer.solvePhysicalReedV2({
      ...common,
      mouthPressure: 0.1,
      borePressure: 0.1,
      opening: 0.7,
    }),
  ).toBeNull();
});
