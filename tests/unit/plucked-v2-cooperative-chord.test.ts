import { describe, expect, test } from "bun:test";

import { createPluckedChordRenderFunctions } from "../../src/audio/dsp-renderer";

const MIDI = Object.freeze([48, 55, 60, 64, 67, 72]);
const VELOCITIES = Object.freeze([92, 81, 74, 69, 63, 58]);
const FRAME_COUNT = 37;

type FakeControls = {
  failInitOnce: boolean;
  failStepOnce: boolean;
  neverComplete: boolean;
  yields: number;
};

function requestSeed(
  pack: number,
  sampleRate: number,
  midis: Int32Array,
  velocities: Int32Array,
): number {
  let seed = (pack + 1) * 97 + sampleRate;
  for (let index = 0; index < midis.length; index += 1) {
    seed = Math.imul(seed ^ (midis[index] ?? 0), 31) +
      Math.imul(velocities[index] ?? 0, 17);
  }
  return seed | 0;
}

function fillPcm(
  memory: WebAssembly.Memory,
  seed: number,
  leftPointer: number,
  rightPointer: number,
  frames: number,
): void {
  const left = new Float32Array(memory.buffer, leftPointer, frames);
  const right = new Float32Array(memory.buffer, rightPointer, frames);
  for (let frame = 0; frame < frames; frame += 1) {
    const value = Math.fround(((seed & 0xffff) - 32_768 + frame * 173) / 65_536);
    left[frame] = value;
    right[frame] = Math.fround(value * 0.875 - frame / 131_072);
  }
}

function makeHarness(packIndex: number): Readonly<{
  controls: FakeControls;
  renders: ReturnType<typeof createPluckedChordRenderFunctions>;
}> {
  const memory = new WebAssembly.Memory({ initial: 2 });
  const controls: FakeControls = {
    failInitOnce: false,
    failStepOnce: false,
    neverComplete: false,
    yields: 0,
  };
  const renders = createPluckedChordRenderFunctions({
    packIndex,
    memory,
    scratchBase: 1_024,
    cooperativeScratchBase: 65_536,
    abi: {
      noteFrames: () => FRAME_COUNT,
      renderChordInto: (
        pack,
        midiPointer,
        velocityPointer,
        noteCount,
        sampleRate,
        leftPointer,
        rightPointer,
        capacity,
      ) => {
        const midis = new Int32Array(memory.buffer, midiPointer, noteCount);
        const velocities = new Int32Array(memory.buffer, velocityPointer, noteCount);
        fillPcm(
          memory,
          requestSeed(pack, sampleRate, midis, velocities),
          leftPointer,
          rightPointer,
          capacity,
        );
        return capacity;
      },
      sessionStateMaxBytes: () => 64,
      sessionMaxSteps: () => 4,
      sessionInit: (
        pack,
        midiPointer,
        velocityPointer,
        noteCount,
        sampleRate,
        _capacity,
        statePointer,
      ) => {
        if (controls.failInitOnce) {
          controls.failInitOnce = false;
          return 0;
        }
        const midis = new Int32Array(memory.buffer, midiPointer, noteCount);
        const velocities = new Int32Array(memory.buffer, velocityPointer, noteCount);
        const state = new Int32Array(memory.buffer, statePointer, 4);
        state[0] = 0;
        state[1] = requestSeed(pack, sampleRate, midis, velocities);
        return 16;
      },
      sessionStep: (
        statePointer,
        _stateBytes,
        leftPointer,
        rightPointer,
        capacity,
      ) => {
        if (controls.failStepOnce) {
          controls.failStepOnce = false;
          return 0;
        }
        const state = new Int32Array(memory.buffer, statePointer, 4);
        state[0] = (state[0] ?? 0) + 1;
        if (controls.neverComplete || state[0] < 3) return 1;
        fillPcm(memory, state[1] ?? 0, leftPointer, rightPointer, capacity);
        return 2;
      },
    },
    yieldToMacrotask: () => new Promise((resolve) => {
      setTimeout(() => {
        controls.yields += 1;
        resolve();
      }, 0);
    }),
  });
  return Object.freeze({ controls, renders });
}

describe("PLK2 cooperative chord host", () => {
  test("is bit-identical to sync for four packs and browser sample rates", async () => {
    for (let pack = 0; pack < 4; pack += 1) {
      for (const sampleRate of [44_100, 48_000, 96_000]) {
        const { controls, renders } = makeHarness(pack);
        const sync = renders.renderChord?.(MIDI, VELOCITIES, sampleRate);
        const cooperative = await renders.renderChordCooperatively?.(
          MIDI,
          VELOCITIES,
          sampleRate,
        );
        expect(sync).not.toBeNull();
        expect(cooperative).not.toBeNull();
        expect(cooperative?.frameCount).toBe(sync?.frameCount);
        expect(cooperative?.left).toEqual(sync?.left);
        expect(cooperative?.right).toEqual(sync?.right);
        expect(controls.yields).toBe(2);
      }
    }
  });

  test("refuses hostile init, step, and nontermination then recovers", async () => {
    const { controls, renders } = makeHarness(2);
    const render = renders.renderChordCooperatively;
    expect(render).toBeDefined();
    if (render === undefined) throw new Error("TEST_COOPERATIVE_RENDER_MISSING");

    controls.failInitOnce = true;
    expect(await render(MIDI, VELOCITIES, 48_000)).toBeNull();
    expect(await render(MIDI, VELOCITIES, 48_000)).not.toBeNull();

    controls.failStepOnce = true;
    expect(await render(MIDI, VELOCITIES, 48_000)).toBeNull();
    expect(await render(MIDI, VELOCITIES, 48_000)).not.toBeNull();

    controls.neverComplete = true;
    expect(await render(MIDI, VELOCITIES, 48_000)).toBeNull();
    controls.neverComplete = false;
    expect(await render(MIDI, VELOCITIES, 48_000)).not.toBeNull();
  });

  test("does not expose cooperative rendering for a partial ABI", () => {
    const renders = createPluckedChordRenderFunctions({
      packIndex: 0,
      memory: new WebAssembly.Memory({ initial: 1 }),
      scratchBase: 1_024,
      cooperativeScratchBase: 32_768,
      abi: {
        noteFrames: () => FRAME_COUNT,
        sessionStateMaxBytes: () => 64,
      },
    });
    expect(renders.renderChord).toBeUndefined();
    expect(renders.renderChordCooperatively).toBeUndefined();
  });
});
