import { expect, test } from "bun:test";

import { createAudioEngineWithRenderCacheLimitsForTest } from "../../src/audio/audio-engine";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import { midi, readyEngine, requireSuccess } from "../support/audio-engine-test-kit";

type Ready = Readonly<{
  engine: Awaited<ReturnType<typeof readyEngine>>["engine"];
  fake: Awaited<ReturnType<typeof readyEngine>>["fake"];
}>;

async function readyEngineWithCacheLimits(
  limits: Parameters<typeof createAudioEngineWithRenderCacheLimitsForTest>[1],
): Promise<Ready> {
  const fake = createFakeAudioPlatform();
  const engine = createAudioEngineWithRenderCacheLimitsForTest(
    fake.platform,
    limits,
  );
  requireSuccess(
    await engine.initializeAudioEngine({
      gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
      initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
    }),
  );
  return { engine, fake };
}

function bufferCreates(fake: Ready["fake"]): number {
  return fake.events.filter(({ kind }) => kind === "buffer-create").length;
}

async function prepareNotes(
  ready: Ready,
  instrumentId: "concert-grand" | "guitar",
  midiPitches: readonly number[],
  velocity = 100,
): Promise<void> {
  for (let start = 0; start < midiPitches.length; start += 32) {
    const batch = midiPitches.slice(start, start + 32);
    requireSuccess(
      await ready.engine.prepareRenderedAudioVoices({
        instrumentId,
        notes: batch.map((pitch) => ({ midiPitch: midi(pitch), velocity })),
      }),
    );
  }
}

function range(startMidi: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => startMidi + index);
}

test("one recipe's entry limit evicts only its own entries, and an LRU refresh protects a touched entry", async () => {
  const ready = await readyEngine();
  const { fake } = ready;

  /* Warm one concert-grand buffer (limit 96), then fill guitar (limit 64). */
  await prepareNotes(ready, "concert-grand", [60]);
  const pianoWarm = bufferCreates(fake);

  /*
   * Re-pinned for the instrument-range fold policy
   * (jcpe-instrument-range-fold-policy-s1uz): guitar realizes only pitches
   * inside its 40-88 window, capping distinct pitch entries at 49, so the
   * 64 distinct cache entries come from 49 in-window pitches at one
   * velocity band plus 15 more at a second band. The eviction and LRU
   * assertions below are unchanged.
   */
  const guitarKeys = range(40, 49);
  await prepareNotes(ready, "guitar", guitarKeys);
  await prepareNotes(ready, "guitar", range(40, 15), 30);
  const guitarFull = bufferCreates(fake);
  expect(guitarFull - pianoWarm).toBe(64);

  /* Refresh guitar key #1 so the next eviction must choose key #2. */
  await prepareNotes(ready, "guitar", [40]);
  expect(bufferCreates(fake)).toBe(guitarFull);

  /* The 65th distinct guitar key evicts exactly one guitar entry. */
  await prepareNotes(ready, "guitar", [55], 30);
  const afterOverflow = bufferCreates(fake);
  expect(afterOverflow).toBe(guitarFull + 1);

  /* The concert-grand entry survived the guitar-driven eviction. */
  await prepareNotes(ready, "concert-grand", [60]);
  expect(bufferCreates(fake)).toBe(afterOverflow);

  /* The refreshed guitar key survived; the unrefreshed oldest did not. */
  await prepareNotes(ready, "guitar", [40]);
  expect(bufferCreates(fake)).toBe(afterOverflow);
  await prepareNotes(ready, "guitar", [41]);
  expect(bufferCreates(fake)).toBe(afterOverflow + 1);
}, 120_000);

test("the global entry ceiling evicts the globally least-recently-used entry across recipes", async () => {
  /*
   * A synthetic global ceiling keeps the proof fast and deterministic: real
   * renders trim trailing silence, so byte totals from ~129 live renders are
   * not exactly predictable. The production ceilings use the identical code
   * path with the contract constants.
   */
  const ready = await readyEngineWithCacheLimits({ maximumCacheEntries: 4 });
  const { fake } = ready;

  await prepareNotes(ready, "concert-grand", [60, 62, 64]);
  await prepareNotes(ready, "guitar", [50]);
  const filled = bufferCreates(fake);

  /* Fifth entry exceeds the global ceiling; the victim is the globally
   * oldest entry, which lives in the OTHER recipe's cache. */
  await prepareNotes(ready, "guitar", [51]);
  expect(bufferCreates(fake)).toBe(filled + 1);

  /* concert-grand 60 was evicted; every other entry survived. */
  await prepareNotes(ready, "concert-grand", [62, 64]);
  await prepareNotes(ready, "guitar", [50, 51]);
  expect(bufferCreates(fake)).toBe(filled + 1);
  await prepareNotes(ready, "concert-grand", [60]);
  expect(bufferCreates(fake)).toBe(filled + 2);
}, 120_000);

test("the global PCM byte ceiling is enforced across recipes", async () => {
  /* A one-byte ceiling forces every insert to evict; the cache never holds
   * an entry, so the same key renders again on every request. */
  const ready = await readyEngineWithCacheLimits({ maximumCachePcmBytes: 1 });
  const { fake } = ready;
  await prepareNotes(ready, "concert-grand", [60]);
  const first = bufferCreates(fake);
  await prepareNotes(ready, "concert-grand", [60]);
  expect(bufferCreates(fake)).toBe(first + 1);
}, 120_000);
