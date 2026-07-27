import { describe, expect, test } from "bun:test";

import { createBrowserAudioPlatform } from "../../src/audio/runtime";
import { holdAudioParamAtTime } from "../../src/audio/audio-dsp";

type ParameterEvent = Readonly<{
  kind: string;
  value: number;
  atTimeSeconds: number;
}>;

type NativeBufferLike = {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  getChannelData(channel: number): Float32Array;
};

class NativeParameterWithoutHold {
  value = 0;
  readonly events: ParameterEvent[] = [];

  setValueAtTime(value: number, atTimeSeconds: number): this {
    this.events.push({ kind: "set", value, atTimeSeconds });
    this.value = value;
    return this;
  }

  linearRampToValueAtTime(value: number, atTimeSeconds: number): this {
    this.events.push({ kind: "linear", value, atTimeSeconds });
    this.value = value;
    return this;
  }

  exponentialRampToValueAtTime(value: number, atTimeSeconds: number): this {
    this.events.push({ kind: "exponential", value, atTimeSeconds });
    this.value = value;
    return this;
  }

  setTargetAtTime(value: number, atTimeSeconds: number): this {
    this.events.push({ kind: "target", value, atTimeSeconds });
    this.value = value;
    return this;
  }

  cancelScheduledValues(atTimeSeconds: number): this {
    this.events.push({ kind: "cancel", value: this.value, atTimeSeconds });
    return this;
  }
}

function nativeNodeMethods(): Readonly<{
  connect(): void;
  disconnect(): void;
}> {
  return Object.freeze({
    connect() {},
    disconnect() {},
  });
}

describe("X0 browser audio platform boundary", () => {
  test("omits unsupported cancelAndHold and keeps native buffers opaque", () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "AudioContext",
    );
    const parameter = new NativeParameterWithoutHold();
    let nativeBuffer: NativeBufferLike | null = null;
    const nativeConvolver: {
      buffer: NativeBufferLike | null;
      normalize: boolean;
      connect(): void;
      disconnect(): void;
    } = {
      ...nativeNodeMethods(),
      buffer: null,
      normalize: true,
    };

    class NativeContextWithoutHold {
      readonly sampleRate = 48_000;
      readonly currentTime = 0;
      readonly destination = {
        ...nativeNodeMethods(),
        maxChannelCount: 2,
      };
      readonly state = "running";
      onstatechange: (() => void) | null = null;

      createGain() {
        return { ...nativeNodeMethods(), gain: parameter };
      }

      createConvolver() {
        return nativeConvolver;
      }

      createBuffer(
        numberOfChannels: number,
        length: number,
        sampleRate: number,
      ) {
        const channels = Array.from(
          { length: numberOfChannels },
          () => new Float32Array(length),
        );
        nativeBuffer = {
          numberOfChannels,
          length,
          sampleRate,
          duration: length / sampleRate,
          getChannelData(channel: number) {
            const data = channels[channel];
            if (data === undefined) throw new Error("TEST_CHANNEL_INVALID");
            return data;
          },
        };
        return nativeBuffer;
      }

      resume(): Promise<void> {
        return Promise.resolve();
      }

      close(): Promise<void> {
        return Promise.resolve();
      }
    }

    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      writable: true,
      value: NativeContextWithoutHold,
    });
    try {
      const context = createBrowserAudioPlatform().createContext({
        latencyHint: "interactive",
      });
      const parameterPort = context.createGain().gain;
      expect("cancelAndHoldAtTime" in parameterPort).toBe(false);
      let recordedEvents = 0;
      holdAudioParamAtTime(parameterPort, 0.5, 0.25, (count) => {
        recordedEvents += count;
      });
      expect(recordedEvents).toBe(2);
      expect(parameter.events).toEqual([
        { kind: "cancel", value: 0, atTimeSeconds: 0.5 },
        { kind: "set", value: 0.25, atTimeSeconds: 0.5 },
      ]);

      const bufferPort = context.createBuffer(2, 16, 48_000);
      expect(bufferPort).not.toBe(nativeBuffer);
      expect(bufferPort.getChannelData(1)).toHaveLength(16);
      const convolver = context.createConvolver();
      convolver.buffer = bufferPort;
      expect(nativeConvolver.buffer).toBe(nativeBuffer);
      expect(convolver.buffer).toBe(bufferPort);
    } finally {
      if (originalDescriptor === undefined) {
        Reflect.deleteProperty(globalThis, "AudioContext");
      } else {
        Object.defineProperty(globalThis, "AudioContext", originalDescriptor);
      }
    }
  });
});
