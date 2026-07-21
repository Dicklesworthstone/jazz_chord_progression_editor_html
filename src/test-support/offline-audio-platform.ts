import type { AudioPlatform } from "../audio";
import {
  createNativeAudioContextPort,
  type NativeAudioContextLifecycle,
} from "../audio/browser-audio-platform";

const OFFLINE_CHANNEL_COUNT = 2;
const MAX_OFFLINE_RENDER_SECONDS = 8;
const MIN_OFFLINE_SAMPLE_RATE = 8_000;
const MAX_OFFLINE_SAMPLE_RATE = 192_000;
const MAX_OFFLINE_FRAME_COUNT =
  MAX_OFFLINE_RENDER_SECONDS * MAX_OFFLINE_SAMPLE_RATE;

export type OfflineAudioPlatformOptions = Readonly<{
  sampleRate: number;
  renderDurationSeconds: number;
}>;

export type OfflineAudioPlatformHarness = Readonly<{
  platform: AudioPlatform;
  contextCreationCount(): number;
  createdBuffers(): readonly AudioBuffer[];
  convolverAssignedBuffers(): readonly AudioBuffer[];
  nativeContext(): OfflineAudioContext | null;
  startRendering(): Promise<AudioBuffer>;
}>;

type OfflineAudioContextConstructor = new (options: Readonly<{
  numberOfChannels: number;
  length: number;
  sampleRate: number;
}>) => OfflineAudioContext;

type OfflineAudioGlobal = typeof globalThis &
  Readonly<{
    webkitOfflineAudioContext?: OfflineAudioContextConstructor;
  }>;

function requireFiniteNumber(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(code);
  }
}

function offlineAudioContextConstructor(): OfflineAudioContextConstructor {
  if (typeof globalThis.OfflineAudioContext === "function") {
    return globalThis.OfflineAudioContext;
  }
  const webkitConstructor = (globalThis as OfflineAudioGlobal)
    .webkitOfflineAudioContext;
  if (typeof webkitConstructor === "function") return webkitConstructor;
  throw new Error("X0_OFFLINE_AUDIO_CONTEXT_UNAVAILABLE");
}

/**
 * Gives the production engine native OfflineAudioContext nodes while replacing
 * only the realtime resume/close lifecycle with deterministic scheduling-ready
 * semantics. The native context still owns all DSP and rendering.
 */
export function createOfflineAudioPlatform(
  options: OfflineAudioPlatformOptions,
): OfflineAudioPlatformHarness {
  requireFiniteNumber(
    options.sampleRate,
    MIN_OFFLINE_SAMPLE_RATE,
    MAX_OFFLINE_SAMPLE_RATE,
    "X0_OFFLINE_SAMPLE_RATE_INVALID",
  );
  if (!Number.isInteger(options.sampleRate)) {
    throw new Error("X0_OFFLINE_SAMPLE_RATE_NOT_INTEGER");
  }
  requireFiniteNumber(
    options.renderDurationSeconds,
    0.001,
    MAX_OFFLINE_RENDER_SECONDS,
    "X0_OFFLINE_DURATION_INVALID",
  );

  const frameCount = Math.ceil(
    options.sampleRate * options.renderDurationSeconds,
  );
  if (
    !Number.isSafeInteger(frameCount) ||
    frameCount < 1 ||
    frameCount > MAX_OFFLINE_FRAME_COUNT
  ) {
    throw new Error("X0_OFFLINE_FRAME_COUNT_INVALID");
  }

  let creationCount = 0;
  let nativeContext: OfflineAudioContext | null = null;
  let renderPromise: Promise<AudioBuffer> | null = null;
  let syntheticState: "running" | "closed" = "running";
  let stateHandler: (() => void) | null = null;
  const createdBuffers: AudioBuffer[] = [];
  const convolverAssignedBuffers: AudioBuffer[] = [];

  const platform: AudioPlatform = Object.freeze({
    createContext() {
      if (nativeContext !== null) {
        throw new Error("X0_OFFLINE_CONTEXT_RECREATION_FORBIDDEN");
      }
      const Constructor = offlineAudioContextConstructor();
      const created = new Constructor({
        numberOfChannels: OFFLINE_CHANNEL_COUNT,
        length: frameCount,
        sampleRate: options.sampleRate,
      });
      creationCount += 1;
      nativeContext = created;

      const lifecycle: NativeAudioContextLifecycle = Object.freeze({
        state: () => syntheticState,
        setStateHandler(handler) {
          stateHandler = handler;
        },
        resume: () =>
          syntheticState === "running"
            ? Promise.resolve()
            : Promise.reject(new Error("X0_OFFLINE_CONTEXT_CLOSED")),
        close: () => {
          syntheticState = "closed";
          const handler = stateHandler;
          if (handler !== null) queueMicrotask(handler);
          return Promise.resolve();
        },
      });

      return createNativeAudioContextPort(created, lifecycle, {
        bufferCreated(buffer) {
          createdBuffers.push(buffer);
        },
        convolverBufferAssigned(buffer) {
          convolverAssignedBuffers.push(buffer);
        },
      });
    },
  });

  return Object.freeze({
    platform,
    contextCreationCount: () => creationCount,
    createdBuffers: () => Object.freeze([...createdBuffers]),
    convolverAssignedBuffers: () =>
      Object.freeze([...convolverAssignedBuffers]),
    nativeContext: () => nativeContext,
    startRendering() {
      if (nativeContext === null) {
        return Promise.reject(new Error("X0_OFFLINE_CONTEXT_NOT_CREATED"));
      }
      renderPromise ??= nativeContext.startRendering();
      return renderPromise;
    },
  });
}
