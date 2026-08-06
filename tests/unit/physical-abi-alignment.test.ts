import { expect, test } from "bun:test";

import { loadConcertGrandRenderer } from "../../src/audio/dsp-renderer";

// f64-bearing state regions must be 8-byte aligned before the ABI validator
// may claim the request proven. A 4-aligned state offset passed the previous
// validator and then made the host Float64Array view throw — exactly the
// trap class phs_validate_v2 exists to exclude. These cases live in their
// own file because tests/unit/physical-abi.test.ts carries in-flight peer
// work (jcpe-mnsc.2.3).

const layout = {
  abiVersion: 2,
  requestByteLength: 256,
  descriptorOffset: 256,
  descriptorCount: 2,
  controlPointOffset: 512,
  controlPointCount: 4,
  outputLeftOffset: 4_096,
  outputRightOffset: 8_192,
  outputCapacityFrames: 512,
  stateInputOffset: 0,
  stateInputByteLength: 0,
  stateOutputOffset: 12_288,
  stateOutputCapacityBytes: 256,
} as const;

test("a state-output offset at 4 mod 8 refuses with the named bounds code", async () => {
  const renderer = await loadConcertGrandRenderer();
  expect(
    renderer.validatePhysicalAbiV2({ ...layout, stateOutputOffset: 12_292 }, 1_048_576),
  ).toBe("physical.abi_bounds_invalid");
});

test("a state-input offset at 4 mod 8 refuses with the named bounds code", async () => {
  const renderer = await loadConcertGrandRenderer();
  expect(
    renderer.validatePhysicalAbiV2(
      { ...layout, stateInputOffset: 16_388, stateInputByteLength: 8 },
      1_048_576,
    ),
  ).toBe("physical.abi_bounds_invalid");
});

test("eight-aligned state ranges still accept", async () => {
  const renderer = await loadConcertGrandRenderer();
  expect(
    renderer.validatePhysicalAbiV2(
      { ...layout, stateInputOffset: 16_384, stateInputByteLength: 8 },
      1_048_576,
    ),
  ).toBeNull();
});

test("an odd frame count renders without a misaligned host state view", async () => {
  // Regression: statePointer = scratchBase + 2 * frames * 4 was 4 mod 8 for
  // odd frame counts, so this exact request used to throw in the host before
  // any wasm validation ran.
  const renderer = await loadConcertGrandRenderer();
  const result = renderer.renderPhysicalModalV2({
    sampleRateHz: 48_000,
    frequencyHz: 440,
    dampingPerSecond: 2,
    excitation: 0.5,
    initialState: { x: 0, y: 0 },
    frameCount: 255,
  });
  expect(result).not.toBeNull();
  if (result === null) throw new Error("ODD_FRAME_RENDER_REFUSED");
  expect(result.frameCount).toBe(255);
  expect(Number.isFinite(result.state.x)).toBe(true);
});
