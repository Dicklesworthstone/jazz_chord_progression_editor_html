import { createHash } from "node:crypto";

import { describe, expect, test } from "bun:test";

import {
  createPulseWaveCoefficients,
  createSoftClipCurve,
  evaluateLinearAutomation,
  holdAudioParamAtTime,
  writeDeterministicImpulse,
} from "../../src/audio/audio-dsp";
import type {
  AudioBufferPort,
  AudioParamPort,
} from "../../src/audio/audio-platform-contract";

function createBuffer(sampleRate: number): AudioBufferPort {
  const length = sampleRate * 2;
  const channels = [new Float32Array(length), new Float32Array(length)] as const;
  return {
    numberOfChannels: 2,
    length,
    sampleRate,
    duration: 2,
    getChannelData(channel) {
      const data = channels[channel];
      if (data === undefined) throw new Error("TEST_AUDIO_CHANNEL_INVALID");
      return data;
    },
  };
}

function int16Bytes(values: Float32Array): Buffer {
  const bytes = Buffer.alloc(values.length * 2);
  for (let index = 0; index < values.length; index += 1) {
    bytes.writeInt16LE(Math.trunc((values[index] ?? 0) * 32_768), index * 2);
  }
  return bytes;
}

describe("X0 deterministic audio DSP", () => {
  test("writes the independently reviewed 48 kHz Q15 impulse", () => {
    const buffer = createBuffer(48_000);
    const observation = writeDeterministicImpulse(buffer);
    expect(observation).toEqual({
      samplesWritten: 192_000,
      peakQ15: 32_595,
      finalStateUint32: 0xa07e6c9f,
    });

    const leftBytes = int16Bytes(buffer.getChannelData(0));
    const rightBytes = int16Bytes(buffer.getChannelData(1));
    const interleaved = Buffer.alloc(buffer.length * 4);
    for (let frame = 0; frame < buffer.length; frame += 1) {
      leftBytes.copy(interleaved, frame * 4, frame * 2, frame * 2 + 2);
      rightBytes.copy(interleaved, frame * 4 + 2, frame * 2, frame * 2 + 2);
    }
    expect(createHash("sha256").update(leftBytes).digest("hex")).toBe(
      "fca2e65890c77fdb0ad08d6cada5b0ed398ce9f97c46e279b306a5c8a870fe53",
    );
    expect(createHash("sha256").update(rightBytes).digest("hex")).toBe(
      "060054f6c4797b6ba6a11798e261455596a7ab4f17042aa7d2882b7569fd5bec",
    );
    expect(createHash("sha256").update(interleaved).digest("hex")).toBe(
      "8329fc9abc8b16eeac673bd4a1e0f1e8c9a4900939e6fc00191b429066867f89",
    );
  });

  test("creates the exact bounded odd soft-clip curve", () => {
    const curve = createSoftClipCurve();
    expect(curve).toHaveLength(4_097);
    expect(curve[0]).toBe(-1);
    expect(curve[2_048]).toBe(0);
    expect(curve[4_096]).toBe(1);
    const drive = 1.5;
    const denominator = Math.tanh(drive);
    for (let index = 0; index < curve.length; index += 1) {
      const input = (index * 2) / (curve.length - 1) - 1;
      const expected = Math.fround(Math.tanh(drive * input) / denominator);
      expect(curve[index], `soft-clip[${String(index)}]`).toBe(expected);
      expect(Number.isFinite(curve[index])).toBe(true);
      if (index > 0) {
        expect((curve[index] ?? -2) >= (curve[index - 1] ?? 2)).toBe(true);
      }
    }
  });

  test("creates a normalized 32-harmonic 25-percent pulse authority", () => {
    const coefficients = createPulseWaveCoefficients();
    expect(coefficients.real).toHaveLength(33);
    expect(coefficients.imaginary).toHaveLength(33);
    expect(coefficients.real[0]).toBe(0);
    expect(coefficients.imaginary[0]).toBe(0);
    for (let harmonic = 1; harmonic <= 32; harmonic += 1) {
      const angle = 2 * Math.PI * harmonic * 0.25;
      expect(
        coefficients.real[harmonic],
        `pulse.real[${String(harmonic)}]`,
      ).toBe(
        Math.fround(Math.sin(angle) / (Math.PI * harmonic)),
      );
      expect(
        coefficients.imaginary[harmonic],
        `pulse.imaginary[${String(harmonic)}]`,
      ).toBe(
        Math.fround((1 - Math.cos(angle)) / (Math.PI * harmonic)),
      );
    }
  });

  test("uses the analytic hold oracle when cancelAndHoldAtTime is absent", () => {
    const events: string[] = [];
    let value = 0.9;
    const parameter: AudioParamPort = {
      get value() {
        return value;
      },
      set value(next) {
        value = next;
      },
      setValueAtTime(next, atTimeSeconds) {
        value = next;
        events.push(`set:${String(next)}:${String(atTimeSeconds)}`);
        return parameter;
      },
      linearRampToValueAtTime() {
        return parameter;
      },
      exponentialRampToValueAtTime() {
        return parameter;
      },
      setTargetAtTime() {
        return parameter;
      },
      cancelScheduledValues(atTimeSeconds) {
        events.push(`cancel:${String(atTimeSeconds)}`);
        return parameter;
      },
    };
    let work = 0;
    holdAudioParamAtTime(parameter, 5, 0.375, (count) => {
      work += count;
    });
    expect(events).toEqual(["cancel:5", "set:0.375:5"]);
    expect(parameter.value).toBe(0.375);
    expect(work).toBe(2);
  });

  test("evaluates current mix automation without reading a stale param value", () => {
    const automation = {
      startTimeSeconds: 2,
      startValue: 0.8,
      endTimeSeconds: 2.015,
      endValue: 0.5,
    };
    expect(evaluateLinearAutomation(automation, 1)).toBe(0.8);
    expect(evaluateLinearAutomation(automation, 3)).toBe(0.5);
    expect(evaluateLinearAutomation(automation, 2.0075)).toBeCloseTo(0.65, 12);
  });
});
