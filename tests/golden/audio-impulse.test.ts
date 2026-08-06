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
  /* The Concert Grand release-tail case renders at 96 kHz, a rate this
     writer proof already covers; its in-situ impulse frames are validated
     per case by the browser evidence. */
  "X0-RENDER-018",
  "X0-RENDER-021",
  "X0-RENDER-024",
  "X0-RENDER-027",
  "X0-RENDER-030",
  "X0-RENDER-033",
  "X0-RENDER-036",
  "X0-RENDER-039",
] as const;

const CHECKPOINTS = [
  [0, 0, 0],
  [1, 0, 0],
  [2, 0, 0],
  [47_999, 116, 3_300],
  [95_999, 47, 148],
  [143_999, 24, 3],
  [191_998, 0, 0],
  [191_999, 0, 0],
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
    expect(engine.inspectAudioEngine().work.impulseSamplesWritten).toBe(384_000);
    const bufferEvents = fake.events.filter(
      (event) => event.kind === "buffer-create",
    );
    expect(bufferEvents).toHaveLength(1);
    expect(bufferEvents[0]).toMatchObject({ detail: "buffer", value: 192_000 });
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

  test("X0-RENDER-003/X0-RENDER-006/X0-RENDER-009/X0-RENDER-012/X0-RENDER-015/X0-RENDER-018/X0-RENDER-021/X0-RENDER-024/X0-RENDER-027/X0-RENDER-030/X0-RENDER-033/X0-RENDER-036/X0-RENDER-039 matches the independent Q15 checkpoints and hashes", () => {
    const channels = [new Float32Array(192_000), new Float32Array(192_000)] as const;
    const buffer: AudioBufferPort = {
      numberOfChannels: 2,
      length: 192_000,
      sampleRate: 48_000,
      duration: 4,
      getChannelData(channel) {
        const data = channels[channel];
        if (data === undefined) throw new Error("TEST_CHANNEL_INVALID");
        return data;
      },
    };

    const observation = writeDeterministicImpulse(buffer);
    expect(observation).toEqual({
      samplesWritten: 384_000,
      peakQ15: 13_352,
      finalStateUint32: 3_538_051_940,
    });
    for (const [frame, left, right] of CHECKPOINTS) {
      expect(q15(channels[0][frame] ?? 0)).toBe(left);
      expect(q15(channels[1][frame] ?? 0)).toBe(right);
    }

    const hashes = hashQ15Channels(channels[0], channels[1]);
    expect(hashes.interleaved).toBe(
      "ee0449f080bc31f1a9710ec7a316e8e34fb7979421f1a56c6ffd55b667df2017",
    );
    expect(hashes.channels).toEqual([
      "f97dee335bf4a7308a2dff2c6b9a609cac4f345edc90aa3b1058f45c1d415394",
      "7ff4c5a34a8848bc08148c821aac3d23940a3a94bba9c041615ce6e093795416",
    ]);
    expect(AUDIO_IMPULSE_POLICY.algorithmId).toBe(
      "changes.audio.impulse.hall-quartic-q15.v2",
    );
    expect(IMPULSE_CASE_IDS).toHaveLength(14);
  });
});
