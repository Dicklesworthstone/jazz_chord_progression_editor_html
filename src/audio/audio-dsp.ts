import type {
  AudioBufferPort,
  AudioParamPort,
  PeriodicWavePort,
  AudioContextPort,
} from "./audio-platform-contract";
import {
  AUDIO_IMPULSE_POLICY,
  AUDIO_PERSISTENT_GRAPH_SETTINGS,
  AUDIO_PULSE_WAVE_POLICY,
} from "./instrument-recipes-contract";

export type LinearAutomation = Readonly<{
  startTimeSeconds: number;
  startValue: number;
  endTimeSeconds: number;
  endValue: number;
}>;

export type ImpulseWriteObservation = Readonly<{
  samplesWritten: number;
  peakQ15: number;
  finalStateUint32: number;
}>;

export type PulseWaveCoefficients = Readonly<{
  real: Float32Array;
  imaginary: Float32Array;
}>;

export function evaluateLinearAutomation(
  automation: LinearAutomation,
  atTimeSeconds: number,
): number {
  if (atTimeSeconds <= automation.startTimeSeconds) {
    return automation.startValue;
  }
  if (atTimeSeconds >= automation.endTimeSeconds) {
    return automation.endValue;
  }
  const duration = automation.endTimeSeconds - automation.startTimeSeconds;
  if (duration <= 0) return automation.endValue;
  const progress = (atTimeSeconds - automation.startTimeSeconds) / duration;
  return (
    automation.startValue +
    (automation.endValue - automation.startValue) * progress
  );
}

export function holdAudioParamAtTime(
  parameter: AudioParamPort,
  atTimeSeconds: number,
  analyticValue: number,
  recordParameterEvents: (count: number) => void,
): void {
  if (parameter.cancelAndHoldAtTime !== undefined) {
    parameter.cancelAndHoldAtTime(atTimeSeconds);
    recordParameterEvents(1);
    return;
  }
  parameter.cancelScheduledValues(atTimeSeconds);
  parameter.setValueAtTime(analyticValue, atTimeSeconds);
  recordParameterEvents(2);
}

export function createSoftClipCurve(): Float32Array {
  const { curveLength, drive } = AUDIO_PERSISTENT_GRAPH_SETTINGS.softClip;
  const curve = new Float32Array(curveLength);
  const denominator = Math.tanh(drive);
  for (let index = 0; index < curve.length; index += 1) {
    const input = (index * 2) / (curve.length - 1) - 1;
    curve[index] = Math.tanh(drive * input) / denominator;
  }
  return curve;
}

export function createPulseWaveCoefficients(): PulseWaveCoefficients {
  const length = AUDIO_PULSE_WAVE_POLICY.harmonicCount + 1;
  const real = new Float32Array(length);
  const imaginary = new Float32Array(length);
  real[0] = AUDIO_PULSE_WAVE_POLICY.dcCoefficient;
  imaginary[0] = 0;
  for (
    let harmonic = 1;
    harmonic <= AUDIO_PULSE_WAVE_POLICY.harmonicCount;
    harmonic += 1
  ) {
    const angle =
      2 * Math.PI * harmonic * AUDIO_PULSE_WAVE_POLICY.dutyCycle;
    real[harmonic] = Math.sin(angle) / (Math.PI * harmonic);
    imaginary[harmonic] =
      (1 - Math.cos(angle)) / (Math.PI * harmonic);
  }
  return { real, imaginary };
}

export function createPulsePeriodicWave(
  context: AudioContextPort,
): PeriodicWavePort {
  const coefficients = createPulseWaveCoefficients();
  return context.createPeriodicWave(
    coefficients.real,
    coefficients.imaginary,
    {
      disableNormalization: AUDIO_PULSE_WAVE_POLICY.disableNormalization,
    },
  );
}

function nextXorshift32(state: number): number {
  let next = state >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}

export function writeDeterministicImpulse(
  buffer: AudioBufferPort,
): ImpulseWriteObservation {
  if (
    buffer.numberOfChannels !== AUDIO_IMPULSE_POLICY.channels ||
    buffer.sampleRate < AUDIO_IMPULSE_POLICY.minimumSampleRate ||
    buffer.sampleRate > AUDIO_IMPULSE_POLICY.maximumSampleRate ||
    !Number.isInteger(buffer.sampleRate) ||
    buffer.length !==
      buffer.sampleRate * AUDIO_IMPULSE_POLICY.durationSeconds
  ) {
    throw new Error("AUDIO_IMPULSE_BUFFER_INVALID");
  }

  const channels = [buffer.getChannelData(0), buffer.getChannelData(1)] as const;
  if (
    channels[0].length !== buffer.length ||
    channels[1].length !== buffer.length
  ) {
    throw new Error("AUDIO_IMPULSE_CHANNEL_LENGTH_INVALID");
  }

  let state = AUDIO_IMPULSE_POLICY.seedUint32 >>> 0;
  let peakQ15 = 0;
  let samplesWritten = 0;
  const frameLengthSquared = buffer.length * buffer.length;
  for (let frameIndex = 0; frameIndex < buffer.length; frameIndex += 1) {
    const remaining = buffer.length - frameIndex;
    const envelopeQ15 = Math.floor(
      (remaining * remaining * AUDIO_IMPULSE_POLICY.envelopeQ15Maximum) /
        frameLengthSquared,
    );
    for (const channel of channels) {
      state = nextXorshift32(state);
      const noise = (state >>> 16) - 32_768;
      const sampleQ15 = Math.trunc(
        (noise * envelopeQ15) / AUDIO_IMPULSE_POLICY.q15Divisor,
      );
      channel[frameIndex] = sampleQ15 / AUDIO_IMPULSE_POLICY.q15Divisor;
      peakQ15 = Math.max(peakQ15, Math.abs(sampleQ15));
      samplesWritten += 1;
    }
  }

  return {
    samplesWritten,
    peakQ15,
    finalStateUint32: state,
  };
}
