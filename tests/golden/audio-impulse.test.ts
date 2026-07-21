import { describe, expect, test } from "bun:test";

import { writeDeterministicImpulse } from "../../src/audio/audio-dsp";
import type { AudioBufferPort } from "../../src/audio/audio-platform-contract";
import {
  AUDIO_IMPULSE_POLICY,
  AUDIO_PERSISTENT_GRAPH_SETTINGS,
} from "../../src/audio/instrument-recipes-contract";
import { readyEngine } from "../support/audio-engine-test-kit";

const IMPULSE_CASE_IDS = [
  "X0-ROUTE-001",
  "X0-RENDER-003",
  "X0-RENDER-006",
  "X0-RENDER-009",
  "X0-RENDER-012",
  "X0-RENDER-015",
] as const;

const CHECKPOINTS = [
  [0, 5_760, -30_637],
  [1, 6_392, -10_676],
  [2, -6_236, 16_279],
  [23_999, -1_564, -660],
  [47_999, -3_175, 6_489],
  [71_999, -330, 48],
  [95_998, 0, 0],
  [95_999, 0, 0],
] as const;

function q15(sample: number): number {
  const value = Math.round(sample * 32_768);
  return Object.is(value, -0) ? 0 : value;
}

function hashQ15Channels(
  left: Float32Array,
  right: Float32Array,
): Readonly<{
  interleaved: string;
  channels: readonly [string, string];
}> {
  const interleavedBytes = new Uint8Array(left.length * 4);
  const channelBytes = [
    new Uint8Array(left.length * 2),
    new Uint8Array(right.length * 2),
  ] as const;
  const interleavedView = new DataView(interleavedBytes.buffer);
  const channelViews = [
    new DataView(channelBytes[0].buffer),
    new DataView(channelBytes[1].buffer),
  ] as const;
  for (let frame = 0; frame < left.length; frame += 1) {
    interleavedView.setInt16(frame * 4, q15(left[frame] ?? 0), true);
    interleavedView.setInt16(frame * 4 + 2, q15(right[frame] ?? 0), true);
    channelViews[0].setInt16(frame * 2, q15(left[frame] ?? 0), true);
    channelViews[1].setInt16(frame * 2, q15(right[frame] ?? 0), true);
  }
  const channelHashes: [string, string] = [
    new Bun.CryptoHasher("sha256").update(channelBytes[0]).digest("hex"),
    new Bun.CryptoHasher("sha256").update(channelBytes[1]).digest("hex"),
  ];
  return Object.freeze({
    interleaved: new Bun.CryptoHasher("sha256")
      .update(interleavedBytes)
      .digest("hex"),
    channels: Object.freeze(channelHashes),
  });
}

describe("TR-X0-IMPULSE deterministic audio impulse golden", () => {
  test("X0-ROUTE-001 constructs exactly one normalized project-authored impulse", async () => {
    const { engine, fake } = await readyEngine();
    expect(engine.inspectAudioEngine().work.impulseSamplesWritten).toBe(192_000);
    const bufferEvents = fake.events.filter(
      (event) => event.kind === "buffer-create",
    );
    expect(bufferEvents).toHaveLength(1);
    expect(bufferEvents[0]).toMatchObject({ detail: "buffer", value: 96_000 });
    expect(
      fake.events.some(
        (event) =>
          event.kind === "node-setting" &&
          event.detail === "normalize" &&
          event.value === "true",
      ),
    ).toBe(true);
    expect(AUDIO_PERSISTENT_GRAPH_SETTINGS.createdNodeCount).toBe(12);
  });

  test("X0-RENDER-003/X0-RENDER-006/X0-RENDER-009/X0-RENDER-012/X0-RENDER-015 matches the independent Q15 checkpoints and hashes", () => {
    const channels = [new Float32Array(96_000), new Float32Array(96_000)] as const;
    const buffer: AudioBufferPort = {
      numberOfChannels: 2,
      length: 96_000,
      sampleRate: 48_000,
      duration: 2,
      getChannelData(channel) {
        const data = channels[channel];
        if (data === undefined) throw new Error("TEST_CHANNEL_INVALID");
        return data;
      },
    };

    const observation = writeDeterministicImpulse(buffer);
    expect(observation).toEqual({
      samplesWritten: 192_000,
      peakQ15: 32_595,
      finalStateUint32: 2_692_639_903,
    });
    for (const [frame, left, right] of CHECKPOINTS) {
      expect(q15(channels[0][frame] ?? 0)).toBe(left);
      expect(q15(channels[1][frame] ?? 0)).toBe(right);
    }

    const hashes = hashQ15Channels(channels[0], channels[1]);
    expect(hashes.interleaved).toBe(
      "8329fc9abc8b16eeac673bd4a1e0f1e8c9a4900939e6fc00191b429066867f89",
    );
    expect(hashes.channels).toEqual([
      "fca2e65890c77fdb0ad08d6cada5b0ed398ce9f97c46e279b306a5c8a870fe53",
      "060054f6c4797b6ba6a11798e261455596a7ab4f17042aa7d2882b7569fd5bec",
    ]);
    expect(AUDIO_IMPULSE_POLICY.algorithmId).toBe(
      "changes.audio.impulse.xorshift32-q15.v1",
    );
    expect(IMPULSE_CASE_IDS).toHaveLength(6);
  });
});
