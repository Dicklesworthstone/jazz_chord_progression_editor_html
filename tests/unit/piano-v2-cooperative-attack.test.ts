import { describe, expect, test } from "bun:test";

import {
  applyPhysicalPianoAttackLayer,
  createConcertGrandCooperativeRenderFunction,
  createPhysicalPianoChordCompleteRenderFunction,
  createPhysicalPianoChordAttackRenderFunction,
  createPhysicalPianoAttackRenderFunction,
  PHYSICAL_PIANO_ATTACK_LAYER_POLICY,
} from "../../src/audio/dsp-renderer";

const FRAME_COUNT = 13;

type Session = {
  steps: number;
  midi: number;
  velocity: number;
  sampleRate: number;
  capacity: number;
};

type Controls = {
  failInitOnce: boolean;
  failStepOnce: boolean;
  failResetOnce: boolean;
  neverComplete: boolean;
  nonFiniteOutput: boolean;
  overboundOutput: boolean;
  maximumSteps: number;
  yields: number;
  resetCalls: number;
  maximumConcurrentTasks: number;
};

type ChordSession = {
  steps: number;
  midis: readonly number[];
  velocities: readonly number[];
  sampleRate: number;
  capacity: number;
};

type ChordControls = Controls & {
  initCalls: number;
  initializedMidis: readonly number[];
  initializedVelocities: readonly number[];
};

function fillPcm(
  memory: WebAssembly.Memory,
  session: Session,
  leftPointer: number,
  rightPointer: number,
): void {
  const left = new Float32Array(memory.buffer, leftPointer, session.capacity);
  const right = new Float32Array(memory.buffer, rightPointer, session.capacity);
  for (let frame = 0; frame < session.capacity; frame += 1) {
    const value = Math.fround(
      (session.midi * 97 + session.velocity * 31 + frame * 17) / 65_536,
    );
    left[frame] = value;
    right[frame] = Math.fround(value * 0.875 - session.sampleRate / 1e9);
  }
}

function makeHarness(): Readonly<{
  controls: Controls;
  render: ReturnType<typeof createPhysicalPianoAttackRenderFunction>;
}> {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const sessions = new Map<number, Session>();
  let nextHandle = 1;
  let exclusiveTail: Promise<void> = Promise.resolve();
  let activeTasks = 0;
  const controls: Controls = {
    failInitOnce: false,
    failStepOnce: false,
    failResetOnce: false,
    neverComplete: false,
    nonFiniteOutput: false,
    overboundOutput: false,
    maximumSteps: 3,
    yields: 0,
    resetCalls: 0,
    maximumConcurrentTasks: 0,
  };
  const render = createPhysicalPianoAttackRenderFunction({
    memory,
    scratchBase: 1_024,
    abi: {
      noteFrames: (midi, sampleRate) =>
        Number.isSafeInteger(midi) && midi >= 21 && midi <= 108 &&
          Number.isFinite(sampleRate) && sampleRate >= 8_000 &&
          sampleRate <= 96_000
          ? FRAME_COUNT
          : 0,
      runtimeMaxSteps: () => controls.maximumSteps,
      runtimeInit: (midi, velocity, sampleRate, capacity) => {
        if (controls.failInitOnce) {
          controls.failInitOnce = false;
          return 0;
        }
        const handle = nextHandle;
        nextHandle += 1;
        sessions.set(handle, { steps: 0, midi, velocity, sampleRate, capacity });
        return handle;
      },
      runtimeStep: (handle, leftPointer, rightPointer) => {
        const session = sessions.get(handle);
        if (session === undefined) return 0;
        if (controls.failStepOnce) {
          controls.failStepOnce = false;
          return 0;
        }
        session.steps += 1;
        if (controls.neverComplete || session.steps < 3) return 1;
        fillPcm(memory, session, leftPointer, rightPointer);
        if (controls.nonFiniteOutput) {
          new Float32Array(memory.buffer, leftPointer, session.capacity)[0] = Number.NaN;
        }
        if (controls.overboundOutput) {
          new Float32Array(memory.buffer, leftPointer, session.capacity)[0] = 0.98;
        }
        return 2;
      },
      runtimeReset: (handle) => {
        controls.resetCalls += 1;
        if (controls.failResetOnce) {
          controls.failResetOnce = false;
          return 0;
        }
        return sessions.delete(handle) ? 1 : 0;
      },
    },
    yieldToMacrotask: () => new Promise((resolve) => {
      setTimeout(() => {
        controls.yields += 1;
        resolve();
      }, 0);
    }),
    runExclusive: <T>(task: () => Promise<T>): Promise<T> => {
      const run = async (): Promise<T> => {
        activeTasks += 1;
        controls.maximumConcurrentTasks = Math.max(
          controls.maximumConcurrentTasks,
          activeTasks,
        );
        try {
          return await task();
        } finally {
          activeTasks -= 1;
        }
      };
      const result = exclusiveTail.then(run, run);
      exclusiveTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  });
  return Object.freeze({ controls, render });
}

function makeChordHarness(): Readonly<{
  controls: ChordControls;
  render: ReturnType<typeof createPhysicalPianoChordAttackRenderFunction>;
}> {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const sessions = new Map<number, ChordSession>();
  let nextHandle = 1;
  let exclusiveTail: Promise<void> = Promise.resolve();
  let activeTasks = 0;
  const controls: ChordControls = {
    failInitOnce: false,
    failStepOnce: false,
    failResetOnce: false,
    neverComplete: false,
    nonFiniteOutput: false,
    overboundOutput: false,
    maximumSteps: 3,
    yields: 0,
    resetCalls: 0,
    maximumConcurrentTasks: 0,
    initCalls: 0,
    initializedMidis: Object.freeze([]),
    initializedVelocities: Object.freeze([]),
  };
  const render = createPhysicalPianoChordAttackRenderFunction({
    memory,
    scratchBase: 4_096,
    abi: {
      noteFrames: (midi, sampleRate) =>
        Number.isSafeInteger(midi) && midi >= 21 && midi <= 108 &&
          Number.isFinite(sampleRate) && sampleRate >= 8_000 &&
          sampleRate <= 96_000
          ? FRAME_COUNT
          : 0,
      runtimeMaxSteps: () => controls.maximumSteps,
      runtimeInit: (
        midiPointer,
        velocityPointer,
        noteCount,
        sampleRate,
        capacity,
      ) => {
        controls.initCalls += 1;
        if (controls.failInitOnce) {
          controls.failInitOnce = false;
          return 0;
        }
        const midis = Object.freeze([
          ...new Int32Array(memory.buffer, midiPointer, noteCount),
        ]);
        const velocities = Object.freeze([
          ...new Int32Array(memory.buffer, velocityPointer, noteCount),
        ]);
        if (
          midis.some((midi) => midi < 21 || midi > 108) ||
          velocities.some((velocity) => velocity < 1 || velocity > 127) ||
          new Set(midis).size !== midis.length
        ) return 0;
        controls.initializedMidis = midis;
        controls.initializedVelocities = velocities;
        const handle = nextHandle;
        nextHandle += 1;
        sessions.set(handle, {
          steps: 0,
          midis,
          velocities,
          sampleRate,
          capacity,
        });
        return handle;
      },
      runtimeStep: (handle, leftPointer, rightPointer) => {
        const session = sessions.get(handle);
        if (session === undefined) return 0;
        if (controls.failStepOnce) {
          controls.failStepOnce = false;
          return 0;
        }
        session.steps += 1;
        if (controls.neverComplete || session.steps < 3) return 1;
        const pitchSeed = session.midis.reduce((sum, midi) => sum + midi, 0);
        const velocitySeed = session.velocities.reduce(
          (sum, velocity) => sum + velocity,
          0,
        );
        const left = new Float32Array(
          memory.buffer,
          leftPointer,
          session.capacity,
        );
        const right = new Float32Array(
          memory.buffer,
          rightPointer,
          session.capacity,
        );
        for (let frame = 0; frame < session.capacity; frame += 1) {
          const value = Math.fround(
            (pitchSeed * 53 + velocitySeed * 29 + frame * 11) / 262_144,
          );
          left[frame] = value;
          right[frame] = Math.fround(value * 0.875 - session.sampleRate / 1e9);
        }
        if (controls.nonFiniteOutput) left[0] = Number.NaN;
        if (controls.overboundOutput) left[0] = 0.98;
        return 2;
      },
      runtimeReset: (handle) => {
        controls.resetCalls += 1;
        if (controls.failResetOnce) {
          controls.failResetOnce = false;
          return 0;
        }
        return sessions.delete(handle) ? 1 : 0;
      },
    },
    yieldToMacrotask: () => {
      controls.yields += 1;
      return Promise.resolve();
    },
    runExclusive: <T>(task: () => Promise<T>): Promise<T> => {
      const run = async (): Promise<T> => {
        activeTasks += 1;
        controls.maximumConcurrentTasks = Math.max(
          controls.maximumConcurrentTasks,
          activeTasks,
        );
        try {
          return await task();
        } finally {
          activeTasks -= 1;
        }
      };
      const result = exclusiveTail.then(run, run);
      exclusiveTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  });
  return Object.freeze({ controls, render });
}

function makeSustainHarness(): Readonly<{
  controls: {
    maximumSteps: number;
    neverComplete: boolean;
    invalidWritten: boolean;
    overboundOutput: boolean;
    yields: number;
    resets: number;
  };
  render: ReturnType<typeof createConcertGrandCooperativeRenderFunction>;
}> {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const sessions = new Map<number, Session>();
  let nextHandle = 1;
  const controls = {
    maximumSteps: 3,
    neverComplete: false,
    invalidWritten: false,
    overboundOutput: false,
    yields: 0,
    resets: 0,
  };
  const render = createConcertGrandCooperativeRenderFunction({
    memory,
    scratchBase: 2_048,
    abi: {
      noteFrames: () => FRAME_COUNT,
      runtimeMaxSteps: () => controls.maximumSteps,
      runtimeInit: (midi, velocity, sampleRate, capacity) => {
        const handle = nextHandle;
        nextHandle += 1;
        sessions.set(handle, { steps: 0, midi, velocity, sampleRate, capacity });
        return handle;
      },
      runtimeStep: (handle, leftPointer, rightPointer) => {
        const session = sessions.get(handle);
        if (session === undefined) return 0;
        session.steps += 1;
        if (controls.neverComplete || session.steps < 3) return 1;
        fillPcm(memory, session, leftPointer, rightPointer);
        if (controls.overboundOutput) {
          new Float32Array(memory.buffer, leftPointer, session.capacity)[0] = 0.98;
        }
        return 2;
      },
      runtimeWrittenFrames: (handle) => {
        const session = sessions.get(handle);
        if (session === undefined) return 0;
        return controls.invalidWritten ? session.capacity + 1 : Math.min(10, session.capacity);
      },
      runtimeReset: (handle) => {
        controls.resets += 1;
        return sessions.delete(handle) ? 1 : 0;
      },
    },
    yieldToMacrotask: () => {
      controls.yields += 1;
      return Promise.resolve();
    },
  });
  return Object.freeze({ controls, render });
}

describe("cooperative sample-free Concert Grand sustain host", () => {
  test("copies only the reported trim after bounded yielded steps", async () => {
    const { controls, render } = makeSustainHarness();
    const pcm = await render(60, 91, 48_000);
    expect(pcm?.frameCount).toBe(10);
    expect(pcm?.left.length).toBe(10);
    expect(pcm?.right.length).toBe(10);
    expect(pcm?.left[0]).toBeCloseTo((60 * 97 + 91 * 31) / 65_536, 7);
    expect(controls.yields).toBe(2);
    expect(controls.resets).toBe(1);

    const prefix = await render(60, 91, 48_000, 5 / 48_000);
    expect(prefix?.frameCount).toBe(5);
    expect(prefix?.left).toEqual(pcm?.left.slice(0, 5));
  });

  test("nontermination, invalid trim, and overbound PCM refuse then recover", async () => {
    const { controls, render } = makeSustainHarness();
    controls.neverComplete = true;
    expect(await render(60, 91, 48_000)).toBeNull();
    controls.neverComplete = false;
    controls.invalidWritten = true;
    expect(await render(60, 91, 48_000)).toBeNull();
    controls.invalidWritten = false;
    controls.overboundOutput = true;
    expect(await render(60, 91, 48_000)).toBeNull();
    controls.overboundOutput = false;
    expect(await render(60, 91, 48_000)).not.toBeNull();

    controls.maximumSteps = 1_025;
    expect(await render(60, 91, 48_000)).toBeNull();
    expect(await render(60.5, 91, 48_000)).toBeNull();
    expect(await render(60, 91, 0)).toBeNull();
  });
});

describe("PNO2 cooperative physical attack host", () => {
  test("returns deterministic PCM after bounded yielded steps", async () => {
    const { controls, render } = makeHarness();
    const pcm = await render(60, 91, 48_000);
    expect(pcm).not.toBeNull();
    expect(pcm?.sampleRateHz).toBe(48_000);
    expect(pcm?.frameCount).toBe(FRAME_COUNT);
    expect(pcm?.left.length).toBe(FRAME_COUNT);
    expect(pcm?.right.length).toBe(FRAME_COUNT);
    expect(pcm?.left[0]).toBeCloseTo((60 * 97 + 91 * 31) / 65_536, 7);
    expect(controls.yields).toBe(2);
    expect(controls.resetCalls).toBe(1);

    const prefix = await render(60, 91, 48_000, 5 / 48_000);
    expect(prefix?.frameCount).toBe(5);
    expect(prefix?.left).toEqual(pcm?.left.slice(0, 5));
    expect(prefix?.right).toEqual(pcm?.right.slice(0, 5));
  });

  test("serializes concurrent retained sessions", async () => {
    const { controls, render } = makeHarness();
    const [first, second] = await Promise.all([
      render(48, 70, 44_100),
      render(72, 100, 96_000),
    ]);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(controls.maximumConcurrentTasks).toBe(1);
    expect(controls.resetCalls).toBe(2);
  });

  test("fails closed on hostile requests and always recovers", async () => {
    const { controls, render } = makeHarness();
    for (const request of [
      () => render(60.5, 91, 48_000),
      () => render(60, 0, 48_000),
      () => render(60, 128, 48_000),
      () => render(60, 91, Number.NaN),
      () => render(60, 91, 48_000, 0),
      () => render(60, 91, 48_000, Number.POSITIVE_INFINITY),
    ]) expect(await request()).toBeNull();
    expect(controls.resetCalls).toBe(0);

    controls.failInitOnce = true;
    expect(await render(60, 91, 48_000)).toBeNull();
    expect(await render(60, 91, 48_000)).not.toBeNull();

    controls.failStepOnce = true;
    expect(await render(60, 91, 48_000)).toBeNull();
    expect(await render(60, 91, 48_000)).not.toBeNull();

    controls.neverComplete = true;
    expect(await render(60, 91, 48_000)).toBeNull();
    controls.neverComplete = false;
    expect(await render(60, 91, 48_000)).not.toBeNull();

    controls.nonFiniteOutput = true;
    expect(await render(60, 91, 48_000)).toBeNull();
    controls.nonFiniteOutput = false;
    expect(await render(60, 91, 48_000)).not.toBeNull();

    controls.overboundOutput = true;
    expect(await render(60, 91, 48_000)).toBeNull();
    controls.overboundOutput = false;
    expect(await render(60, 91, 48_000)).not.toBeNull();

    controls.failResetOnce = true;
    expect(await render(60, 91, 48_000)).toBeNull();
    expect(await render(60, 91, 48_000)).not.toBeNull();

    controls.maximumSteps = 129;
    expect(await render(60, 91, 48_000)).toBeNull();
    controls.maximumSteps = 3;
    expect(await render(60, 91, 48_000)).not.toBeNull();
  });
});

describe("PNO2 cooperative shared-soundboard chord host", () => {
  test("canonicalizes one simultaneous chord and returns bounded PCM", async () => {
    const { controls, render } = makeChordHarness();
    const pcm = await render([67, 60, 64], [77, 91, 83], 48_000);
    expect(pcm).not.toBeNull();
    expect(pcm?.sampleRateHz).toBe(48_000);
    expect(pcm?.frameCount).toBe(FRAME_COUNT);
    expect(controls.initializedMidis).toEqual([60, 64, 67]);
    expect(controls.initializedVelocities).toEqual([91, 83, 77]);
    expect(controls.yields).toBe(2);
    expect(controls.resetCalls).toBe(1);

    const reordered = await render([64, 67, 60], [83, 77, 91], 48_000);
    expect(reordered).not.toBeNull();
    expect(reordered?.left).toEqual(pcm?.left);
    expect(reordered?.right).toEqual(pcm?.right);

    const prefix = await render(
      [60, 64, 67],
      [91, 83, 77],
      48_000,
      5 / 48_000,
    );
    expect(prefix?.frameCount).toBe(5);
    expect(prefix?.left).toEqual(pcm?.left.slice(0, 5));
    expect(prefix?.right).toEqual(pcm?.right.slice(0, 5));
  });

  test("serializes retained chord sessions", async () => {
    const { controls, render } = makeChordHarness();
    const [first, second] = await Promise.all([
      render([48, 55, 60], [70, 75, 80], 44_100),
      render([72, 76, 79], [90, 95, 100], 96_000),
    ]);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(controls.maximumConcurrentTasks).toBe(1);
    expect(controls.resetCalls).toBe(2);
  });

  test("refuses hostile chord requests before retained initialization", async () => {
    const { controls, render } = makeChordHarness();
    for (const request of [
      () => render([], [], 48_000),
      () => render([60], [], 48_000),
      () => render([60.5], [91], 48_000),
      () => render([20], [91], 48_000),
      () => render([60], [0], 48_000),
      () => render([60], [128], 48_000),
      () => render([60, 60], [91, 92], 48_000),
      () => render([21, 22, 23, 24, 25, 26, 27, 28, 29], new Array(9).fill(64), 48_000),
      () => render([60], [91], Number.NaN),
      () => render([60], [91], 48_000, 0),
      () => render([60], [91], 48_000, Number.POSITIVE_INFINITY),
    ]) expect(await request()).toBeNull();
    expect(controls.initCalls).toBe(0);
    expect(controls.resetCalls).toBe(0);
  });

  test("rejects hostile ABI behavior and recovers the next chord", async () => {
    const { controls, render } = makeChordHarness();
    const request = (): ReturnType<typeof render> =>
      render([60, 64, 67], [91, 83, 77], 48_000);

    controls.failInitOnce = true;
    expect(await request()).toBeNull();
    expect(await request()).not.toBeNull();

    controls.failStepOnce = true;
    expect(await request()).toBeNull();
    expect(await request()).not.toBeNull();

    controls.neverComplete = true;
    expect(await request()).toBeNull();
    controls.neverComplete = false;
    expect(await request()).not.toBeNull();

    controls.nonFiniteOutput = true;
    expect(await request()).toBeNull();
    controls.nonFiniteOutput = false;
    expect(await request()).not.toBeNull();

    controls.overboundOutput = true;
    expect(await request()).toBeNull();
    controls.overboundOutput = false;
    expect(await request()).not.toBeNull();

    controls.failResetOnce = true;
    expect(await request()).toBeNull();
    expect(await request()).not.toBeNull();

    controls.maximumSteps = 129;
    expect(await request()).toBeNull();
    controls.maximumSteps = 3;
    expect(await request()).not.toBeNull();
  });
});

describe("PNO2 sample-free handoff", () => {
  test("a complete chord uses one shared physical onset and canonical sample-free sustains", async () => {
    const sampleRate = 8_000;
    const frameCount = 4_000;
    const physicalFrames = Math.round(
      PHYSICAL_PIANO_ATTACK_LAYER_POLICY.crossfadeEndSeconds * sampleRate,
    );
    const chordCalls: number[][] = [];
    const sustainCalls: number[] = [];
    const render = createPhysicalPianoChordCompleteRenderFunction({
      renderPhysicalChordAttack: (midis, _velocities, requestedRate) => {
        chordCalls.push([...midis]);
        const left = new Float32Array(physicalFrames);
        const right = new Float32Array(physicalFrames);
        for (let frame = 0; frame < physicalFrames; frame += 1) {
          const decay = Math.exp(-frame / 3_000);
          left[frame] = Math.fround(0.18 * decay * Math.sin(frame * 0.17));
          right[frame] = Math.fround(0.16 * decay * Math.sin(frame * 0.17 + 0.2));
        }
        return Promise.resolve(Object.freeze({
          sampleRateHz: requestedRate,
          frameCount: physicalFrames,
          left,
          right,
        }));
      },
      renderSynthesizedNote: (midi, _velocity, requestedRate) => {
        sustainCalls.push(midi);
        const left = new Float32Array(frameCount);
        const right = new Float32Array(frameCount);
        const amplitude = midi / 2_000;
        for (let frame = 0; frame < frameCount; frame += 1) {
          left[frame] = Math.fround(amplitude * Math.sin(frame * 0.17 + 0.1));
          right[frame] = Math.fround(amplitude * Math.sin(frame * 0.17 + 0.3));
        }
        return Promise.resolve(Object.freeze({
          sampleRateHz: requestedRate,
          frameCount,
          left,
          right,
        }));
      },
    });

    const pcm = await render([67, 60, 64], [77, 91, 83], sampleRate);
    expect(pcm).not.toBeNull();
    expect(chordCalls).toEqual([[60, 64, 67]]);
    expect(sustainCalls).toEqual([60, 64, 67]);
    expect(pcm?.frameCount).toBe(frameCount);
    const tail = physicalFrames + 10;
    let expectedLeft = 0;
    for (const midi of [60, 64, 67]) {
      expectedLeft = Math.fround(
        expectedLeft + Math.fround((midi / 2_000) * Math.sin(tail * 0.17 + 0.1)),
      );
    }
    expect(pcm?.left[tail]).toBe(expectedLeft);
    expect(pcm?.left[0]).not.toBe(expectedLeft);

    expect(await render([60, 60], [80, 90], sampleRate)).toBeNull();
    expect(chordCalls).toHaveLength(1);
  });

  test("owns the onset, preserves the sustain, and stays bounded at the seam", () => {
    const sampleRate = 8_000;
    const frameCount = 4_000;
    const physicalFrames = Math.round(
      PHYSICAL_PIANO_ATTACK_LAYER_POLICY.crossfadeEndSeconds * sampleRate,
    );
    const synthLeft = new Float32Array(frameCount);
    const synthRight = new Float32Array(frameCount);
    const physicalLeft = new Float32Array(physicalFrames);
    const physicalRight = new Float32Array(physicalFrames);
    for (let frame = 0; frame < frameCount; frame += 1) {
      synthLeft[frame] = Math.fround(0.21 * Math.sin(frame * 0.17));
      synthRight[frame] = Math.fround(0.18 * Math.sin(frame * 0.17 + 0.3));
      if (frame < physicalFrames) {
        const decay = Math.exp(-frame / 4_000);
        physicalLeft[frame] = Math.fround(-0.24 * decay * Math.sin(frame * 0.17 + 0.1));
        physicalRight[frame] = Math.fround(-0.20 * decay * Math.sin(frame * 0.17 + 0.4));
      }
    }
    const originalSynthLeft = synthLeft.slice();
    const originalSynthRight = synthRight.slice();
    expect(
      applyPhysicalPianoAttackLayer(
        synthLeft,
        synthRight,
        frameCount,
        Object.freeze({
          sampleRateHz: sampleRate,
          frameCount: physicalFrames,
          left: physicalLeft,
          right: physicalRight,
        }),
        sampleRate,
      ),
    ).toBeTrue();
    expect(synthLeft[0]).not.toBe(originalSynthLeft[0]);
    expect(synthRight[0]).not.toBe(originalSynthRight[0]);
    expect(synthLeft.slice(physicalFrames)).toEqual(
      originalSynthLeft.slice(physicalFrames),
    );
    expect(synthRight.slice(physicalFrames)).toEqual(
      originalSynthRight.slice(physicalFrames),
    );
    const peak = Math.max(
      ...synthLeft.map((sample) => Math.abs(sample)),
      ...synthRight.map((sample) => Math.abs(sample)),
    );
    expect(peak).toBeLessThanOrEqual(
      PHYSICAL_PIANO_ATTACK_LAYER_POLICY.peakCeiling,
    );
    const seam = physicalFrames;
    const before = Math.hypot(
      synthLeft[seam - 1] ?? 0,
      synthRight[seam - 1] ?? 0,
    );
    const after = Math.hypot(
      synthLeft[seam] ?? 0,
      synthRight[seam] ?? 0,
    );
    expect(Math.abs(20 * Math.log10((before + 1e-9) / (after + 1e-9))))
      .toBeLessThan(6);
  });

  test("short attacks copy directly while malformed layers refuse unchanged", () => {
    const left = new Float32Array(100).fill(0.125);
    const right = new Float32Array(100).fill(-0.125);
    const shortLeft = new Float32Array(100).fill(0.25);
    const shortRight = new Float32Array(100).fill(-0.2);
    expect(
      applyPhysicalPianoAttackLayer(
        left,
        right,
        100,
        Object.freeze({
          sampleRateHz: 8_000,
          frameCount: 100,
          left: shortLeft,
          right: shortRight,
        }),
        8_000,
      ),
    ).toBeTrue();
    expect(left.slice(0, 100)).toEqual(shortLeft);
    expect(right.slice(0, 100)).toEqual(shortRight);

    const beforeLeft = left.slice();
    const beforeRight = right.slice();
    shortLeft[0] = Number.NaN;
    expect(
      applyPhysicalPianoAttackLayer(
        left,
        right,
        100,
        Object.freeze({
          sampleRateHz: 8_000,
          frameCount: 100,
          left: shortLeft,
          right: shortRight,
        }),
        8_000,
      ),
    ).toBeFalse();
    expect(left).toEqual(beforeLeft);
    expect(right).toEqual(beforeRight);
    shortLeft[0] = 0.98;
    expect(
      applyPhysicalPianoAttackLayer(
        left,
        right,
        100,
        Object.freeze({
          sampleRateHz: 8_000,
          frameCount: 100,
          left: shortLeft,
          right: shortRight,
        }),
        8_000,
      ),
    ).toBeFalse();
    expect(left).toEqual(beforeLeft);
    expect(right).toEqual(beforeRight);

    const longerLeft = new Float32Array(200).fill(0.125);
    const longerRight = new Float32Array(200).fill(-0.125);
    expect(
      applyPhysicalPianoAttackLayer(
        longerLeft,
        longerRight,
        200,
        Object.freeze({
          sampleRateHz: 8_000,
          frameCount: 100,
          left: new Float32Array(100).fill(0.25),
          right: new Float32Array(100).fill(-0.2),
        }),
        8_000,
      ),
    ).toBeFalse();
    expect(longerLeft).toEqual(new Float32Array(200).fill(0.125));
    expect(longerRight).toEqual(new Float32Array(200).fill(-0.125));
  });

  test("invalid rates, fractional lengths, and non-finite synth tails refuse unchanged", () => {
    const left = new Float32Array(200).fill(0.125);
    const right = new Float32Array(200).fill(-0.125);
    const physicalLeft = new Float32Array(100).fill(0.25);
    const physicalRight = new Float32Array(100).fill(-0.2);
    const beforeLeft = left.slice();
    const beforeRight = right.slice();
    const physical = Object.freeze({
      sampleRateHz: 8_000,
      frameCount: 100,
      left: physicalLeft,
      right: physicalRight,
    });

    expect(
      applyPhysicalPianoAttackLayer(left, right, 200, physical, 0),
    ).toBeFalse();
    expect(left).toEqual(beforeLeft);
    expect(right).toEqual(beforeRight);

    expect(
      applyPhysicalPianoAttackLayer(
        left,
        right,
        200,
        Object.freeze({ ...physical, frameCount: 99.5 }),
        8_000,
      ),
    ).toBeFalse();
    expect(left).toEqual(beforeLeft);
    expect(right).toEqual(beforeRight);

    left[150] = Number.NaN;
    const invalidSynth = left.slice();
    expect(
      applyPhysicalPianoAttackLayer(left, right, 200, physical, 8_000),
    ).toBeFalse();
    expect(left.slice(0, 150)).toEqual(invalidSynth.slice(0, 150));
    expect(Number.isNaN(left[150])).toBeTrue();
    expect(left.slice(151)).toEqual(invalidSynth.slice(151));
    expect(right).toEqual(beforeRight);
  });
});
