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

test("clarinet v2 advances real reed state through the embedded wasm and dissipates lay impact", async () => {
  const renderer = await loadConcertGrandRenderer();
  const common = {
    dtSeconds: 1 / 96_000,
    massKg: 0.000_03,
    dampingNsPerM: 0.02,
    stiffnessNPerM: 1_500,
    equilibriumOpeningM: 0.0004,
    effectiveAreaM2: 0.0001,
    channelWidthM: 0.012,
    airDensityKgPerM3: 1.2,
    tongueContact: 0,
  } as const;
  const first = renderer.stepPhysicalClarinetReedV2({
    ...common,
    state: { displacementM: 0.0004, velocityMPerS: 0 },
    mouthPressurePa: 3_000,
    mouthpiecePressurePa: 0,
  });
  if (first === null) throw new Error("PHS2_REED_STEP_REFUSED");
  expect(first.state.displacementM).toBeLessThan(0.0004);
  expect(first.state.velocityMPerS).toBeLessThan(0);
  expect(first.signedVolumeFlowM3PerS).toBeGreaterThan(0);

  const repeated = renderer.stepPhysicalClarinetReedV2({
    ...common,
    state: first.state,
    mouthPressurePa: 3_000,
    mouthpiecePressurePa: 0,
  });
  expect(repeated?.state.displacementM).toBeLessThan(first.state.displacementM);

  const reverse = renderer.stepPhysicalClarinetReedV2({
    ...common,
    state: { displacementM: 0.0002, velocityMPerS: 0 },
    mouthPressurePa: 0,
    mouthpiecePressurePa: 10,
  });
  expect(reverse?.signedVolumeFlowM3PerS).toBeLessThan(0);

  const tongued = renderer.stepPhysicalClarinetReedV2({
    ...common,
    state: { displacementM: 0.0004, velocityMPerS: 0 },
    mouthPressurePa: 0,
    mouthpiecePressurePa: 0,
    tongueContact: 1,
  });
  expect(tongued?.tongueForceN).toBeCloseTo(0.6, 12);
  expect(tongued?.state.displacementM).toBeLessThan(0.0004);

  const impact = renderer.stepPhysicalClarinetReedV2({
    ...common,
    dtSeconds: 1 / 48_000,
    state: { displacementM: 0.000_001, velocityMPerS: -1 },
    mouthPressurePa: 0,
    mouthpiecePressurePa: 0,
  });
  expect(impact?.contact).toBe(true);
  expect(impact?.state).toEqual({ displacementM: 0, velocityMPerS: 0 });
  expect(impact?.collisionLossJ).toBeGreaterThan(0);
  expect(impact?.mechanicalEnergyAfterJ).toBeLessThan(
    impact?.mechanicalEnergyBeforeJ ?? 0,
  );

  expect(renderer.stepPhysicalClarinetReedV2({
    ...common,
    state: { displacementM: 0.0004, velocityMPerS: 0 },
    mouthPressurePa: Number.NaN,
    mouthpiecePressurePa: 0,
  })).toBeNull();
});
