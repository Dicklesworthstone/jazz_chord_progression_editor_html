/**
 * Narrow, injectable Web Audio surface owned by X0.
 *
 * Production adapters wrap native browser objects behind these ports. Fake and
 * OfflineAudioContext adapters implement the same surface without letting raw
 * nodes or contexts escape into application or UI code.
 */

export type AudioContextStatePort =
  | "suspended"
  | "running"
  | "closed"
  | "interrupted";

export type AudioLatencyHintPort = "interactive";
export type AudioBiquadFilterTypePort =
  | "highpass"
  | "lowshelf"
  | "highshelf"
  | "lowpass";
export type AudioOscillatorTypePort =
  | "sine"
  | "triangle"
  | "sawtooth"
  | "custom";
export type AudioWaveShaperOversamplePort = "none" | "2x" | "4x";

export type AudioParamPort = {
  value: number;
  setValueAtTime(value: number, startTime: number): AudioParamPort;
  linearRampToValueAtTime(value: number, endTime: number): AudioParamPort;
  exponentialRampToValueAtTime(value: number, endTime: number): AudioParamPort;
  setTargetAtTime(
    target: number,
    startTime: number,
    timeConstant: number,
  ): AudioParamPort;
  cancelScheduledValues(cancelTime: number): AudioParamPort;
  cancelAndHoldAtTime?(cancelTime: number): AudioParamPort;
};

export type AudioNodePort = {
  connect(destination: AudioNodePort, output?: number, input?: number): void;
  connectParam(destination: AudioParamPort, output?: number): void;
  disconnect(): void;
};

export type AudioScheduledSourceNodePort = AudioNodePort & {
  onended: (() => void) | null;
  start(when?: number): void;
  stop(when?: number): void;
};

export type AudioDestinationNodePort = AudioNodePort & {
  readonly maximumChannelCount: number;
};

export type GainNodePort = AudioNodePort & {
  readonly gain: AudioParamPort;
};

export type BiquadFilterNodePort = AudioNodePort & {
  type: AudioBiquadFilterTypePort;
  readonly frequency: AudioParamPort;
  readonly detune: AudioParamPort;
  readonly q: AudioParamPort;
  readonly gain: AudioParamPort;
};

export type OscillatorNodePort = AudioScheduledSourceNodePort & {
  type: AudioOscillatorTypePort;
  readonly frequency: AudioParamPort;
  readonly detune: AudioParamPort;
  setPeriodicWave(periodicWave: PeriodicWavePort): void;
};

export type DynamicsCompressorNodePort = AudioNodePort & {
  readonly threshold: AudioParamPort;
  readonly knee: AudioParamPort;
  readonly ratio: AudioParamPort;
  readonly attack: AudioParamPort;
  readonly release: AudioParamPort;
  readonly reduction: number;
};

export type WaveShaperNodePort = AudioNodePort & {
  curve: Float32Array | null;
  oversample: AudioWaveShaperOversamplePort;
};

export type ConvolverNodePort = AudioNodePort & {
  buffer: AudioBufferPort | null;
  normalize: boolean;
};

export type AudioBufferPort = {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  getChannelData(channel: number): Float32Array;
};

export type PeriodicWavePort = object;

export type PeriodicWaveOptionsPort = Readonly<{
  disableNormalization: boolean;
}>;

export type AudioContextOptionsPort = Readonly<{
  latencyHint: AudioLatencyHintPort;
}>;

export type AudioContextPort = {
  readonly sampleRate: number;
  readonly currentTime: number;
  readonly destination: AudioDestinationNodePort;
  readonly state: AudioContextStatePort;
  onstatechange: (() => void) | null;
  createGain(): GainNodePort;
  createBiquadFilter(): BiquadFilterNodePort;
  createOscillator(): OscillatorNodePort;
  createDynamicsCompressor(): DynamicsCompressorNodePort;
  createWaveShaper(): WaveShaperNodePort;
  createConvolver(): ConvolverNodePort;
  createBuffer(
    numberOfChannels: number,
    length: number,
    sampleRate: number,
  ): AudioBufferPort;
  createPeriodicWave(
    real: Float32Array,
    imag: Float32Array,
    options: PeriodicWaveOptionsPort,
  ): PeriodicWavePort;
  resume(): Promise<void>;
  close(): Promise<void>;
};

export type AudioPlatform = Readonly<{
  createContext(options: AudioContextOptionsPort): AudioContextPort;
}>;

