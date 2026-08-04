import type {
  AnalyserNodePort,
  AudioBufferPort,
  AudioBufferSourceNodePort,
  AudioBiquadFilterTypePort,
  AudioContextOptionsPort,
  AudioContextPort,
  AudioContextStatePort,
  AudioDestinationNodePort,
  AudioNodePort,
  AudioOscillatorTypePort,
  AudioParamPort,
  AudioPlatform,
  BiquadFilterNodePort,
  ConvolverNodePort,
  DynamicsCompressorNodePort,
  GainNodePort,
  OscillatorNodePort,
  PeriodicWaveOptionsPort,
  PeriodicWavePort,
  WaveShaperNodePort,
} from "./audio-platform-contract";

function normalizeContextState(state: string): AudioContextStatePort {
  if (
    state === "suspended" ||
    state === "running" ||
    state === "closed" ||
    state === "interrupted"
  ) {
    return state;
  }
  throw new Error("AUDIO_BROWSER_CONTEXT_STATE_UNSUPPORTED");
}

/** Test-support may supply an OfflineAudioContext lifecycle at this seam. */
export type NativeAudioContextLifecycle = Readonly<{
  state(): AudioContextStatePort;
  setStateHandler(handler: (() => void) | null): void;
  resume(): Promise<void>;
  close(): Promise<void>;
}>;

export type NativeAudioContextObservation = Readonly<{
  bufferCreated?(buffer: AudioBuffer): void;
  convolverBufferAssigned?(buffer: AudioBuffer): void;
}>;

export function createNativeAudioContextPort(
  nativeContext: BaseAudioContext,
  lifecycle: NativeAudioContextLifecycle,
  observation: NativeAudioContextObservation = {},
): AudioContextPort {
  const nativeNodes = new WeakMap<AudioNodePort, AudioNode>();
  const nativeParameters = new WeakMap<AudioParamPort, AudioParam>();
  const nativeBuffers = new WeakMap<AudioBufferPort, AudioBuffer>();
  const bufferPorts = new WeakMap<AudioBuffer, AudioBufferPort>();
  const nativeWaves = new WeakMap<PeriodicWavePort, PeriodicWave>();

  function registerNode<Node extends AudioNodePort>(
    port: Node,
    nativeNode: AudioNode,
  ): Node {
    nativeNodes.set(port, nativeNode);
    return port;
  }

  function wrapParameter(nativeParameter: AudioParam): AudioParamPort {
    const port: AudioParamPort = {
      get value() {
        return nativeParameter.value;
      },
      set value(value: number) {
        nativeParameter.value = value;
      },
      setValueAtTime(value: number, startTime: number) {
        nativeParameter.setValueAtTime(value, startTime);
        return port;
      },
      linearRampToValueAtTime(value: number, endTime: number) {
        nativeParameter.linearRampToValueAtTime(value, endTime);
        return port;
      },
      exponentialRampToValueAtTime(value: number, endTime: number) {
        nativeParameter.exponentialRampToValueAtTime(value, endTime);
        return port;
      },
      setTargetAtTime(target: number, startTime: number, timeConstant: number) {
        nativeParameter.setTargetAtTime(target, startTime, timeConstant);
        return port;
      },
      cancelScheduledValues(cancelTime: number) {
        nativeParameter.cancelScheduledValues(cancelTime);
        return port;
      },
    };
    if (typeof nativeParameter.cancelAndHoldAtTime === "function") {
      port.cancelAndHoldAtTime = (cancelTime: number) => {
        nativeParameter.cancelAndHoldAtTime(cancelTime);
        return port;
      };
    }
    nativeParameters.set(port, nativeParameter);
    return port;
  }

  function wrapBuffer(nativeBuffer: AudioBuffer): AudioBufferPort {
    const existing = bufferPorts.get(nativeBuffer);
    if (existing !== undefined) return existing;
    const port: AudioBufferPort = {
      get numberOfChannels() {
        return nativeBuffer.numberOfChannels;
      },
      get length() {
        return nativeBuffer.length;
      },
      get sampleRate() {
        return nativeBuffer.sampleRate;
      },
      get duration() {
        return nativeBuffer.duration;
      },
      getChannelData(channel) {
        return nativeBuffer.getChannelData(channel);
      },
    };
    nativeBuffers.set(port, nativeBuffer);
    bufferPorts.set(nativeBuffer, port);
    return port;
  }

  function nodeMethods(nativeNode: AudioNode): AudioNodePort {
    return {
      connect(destination, output, input) {
        const nativeDestination = nativeNodes.get(destination);
        if (nativeDestination === undefined) {
          throw new Error("AUDIO_BROWSER_NODE_DESTINATION_UNKNOWN");
        }
        if (output === undefined) nativeNode.connect(nativeDestination);
        else if (input === undefined) {
          nativeNode.connect(nativeDestination, output);
        } else {
          nativeNode.connect(nativeDestination, output, input);
        }
      },
      connectParam(destination, output) {
        const nativeDestination = nativeParameters.get(destination);
        if (nativeDestination === undefined) {
          throw new Error("AUDIO_BROWSER_PARAM_DESTINATION_UNKNOWN");
        }
        if (output === undefined) nativeNode.connect(nativeDestination);
        else nativeNode.connect(nativeDestination, output);
      },
      disconnect() {
        nativeNode.disconnect();
      },
    };
  }

  function wrapGain(nativeNode: GainNode): GainNodePort {
    const port: GainNodePort = {
      ...nodeMethods(nativeNode),
      gain: wrapParameter(nativeNode.gain),
    };
    return registerNode(port, nativeNode);
  }

  function wrapFilter(nativeNode: BiquadFilterNode): BiquadFilterNodePort {
    let filterType: AudioBiquadFilterTypePort = "lowpass";
    const port: BiquadFilterNodePort = {
      ...nodeMethods(nativeNode),
      get type() {
        return filterType;
      },
      set type(value) {
        filterType = value;
        nativeNode.type = value;
      },
      frequency: wrapParameter(nativeNode.frequency),
      detune: wrapParameter(nativeNode.detune),
      q: wrapParameter(nativeNode.Q),
      gain: wrapParameter(nativeNode.gain),
    };
    return registerNode(port, nativeNode);
  }

  function wrapOscillator(nativeNode: OscillatorNode): OscillatorNodePort {
    let endedHandler: (() => void) | null = null;
    let oscillatorType: AudioOscillatorTypePort = "sine";
    const port: OscillatorNodePort = {
      ...nodeMethods(nativeNode),
      get onended() {
        return endedHandler;
      },
      set onended(value) {
        endedHandler = value;
        nativeNode.onended = value;
      },
      get type() {
        return oscillatorType;
      },
      set type(value) {
        if (value === "custom") {
          throw new Error("AUDIO_BROWSER_CUSTOM_TYPE_REQUIRES_PERIODIC_WAVE");
        }
        oscillatorType = value;
        nativeNode.type = value;
      },
      frequency: wrapParameter(nativeNode.frequency),
      detune: wrapParameter(nativeNode.detune),
      setPeriodicWave(periodicWave) {
        const nativeWave = nativeWaves.get(periodicWave);
        if (nativeWave === undefined) {
          throw new Error("AUDIO_BROWSER_PERIODIC_WAVE_UNKNOWN");
        }
        nativeNode.setPeriodicWave(nativeWave);
        oscillatorType = "custom";
      },
      start(when) {
        if (when === undefined) nativeNode.start();
        else nativeNode.start(when);
      },
      stop(when) {
        if (when === undefined) nativeNode.stop();
        else nativeNode.stop(when);
      },
    };
    return registerNode(port, nativeNode);
  }

  function wrapCompressor(
    nativeNode: DynamicsCompressorNode,
  ): DynamicsCompressorNodePort {
    const port: DynamicsCompressorNodePort = {
      ...nodeMethods(nativeNode),
      threshold: wrapParameter(nativeNode.threshold),
      knee: wrapParameter(nativeNode.knee),
      ratio: wrapParameter(nativeNode.ratio),
      attack: wrapParameter(nativeNode.attack),
      release: wrapParameter(nativeNode.release),
      get reduction() {
        return nativeNode.reduction;
      },
    };
    return registerNode(port, nativeNode);
  }

  function wrapWaveShaper(nativeNode: WaveShaperNode): WaveShaperNodePort {
    const port: WaveShaperNodePort = {
      ...nodeMethods(nativeNode),
      get curve() {
        return nativeNode.curve;
      },
      set curve(value) {
        nativeNode.curve = value;
      },
      get oversample() {
        return nativeNode.oversample;
      },
      set oversample(value) {
        nativeNode.oversample = value;
      },
    };
    return registerNode(port, nativeNode);
  }

  function wrapConvolver(nativeNode: ConvolverNode): ConvolverNodePort {
    const port: ConvolverNodePort = {
      ...nodeMethods(nativeNode),
      get buffer() {
        return nativeNode.buffer === null
          ? null
          : wrapBuffer(nativeNode.buffer);
      },
      set buffer(value) {
        if (value === null) {
          nativeNode.buffer = null;
          return;
        }
        const nativeBuffer = nativeBuffers.get(value);
        if (nativeBuffer === undefined) {
          throw new Error("AUDIO_BROWSER_BUFFER_UNKNOWN");
        }
        nativeNode.buffer = nativeBuffer;
        observation.convolverBufferAssigned?.(nativeBuffer);
      },
      get normalize() {
        return nativeNode.normalize;
      },
      set normalize(value) {
        nativeNode.normalize = value;
      },
    };
    return registerNode(port, nativeNode);
  }

  function wrapBufferSource(
    nativeNode: AudioBufferSourceNode,
  ): AudioBufferSourceNodePort {
    let endedHandler: (() => void) | null = null;
    const port: AudioBufferSourceNodePort = {
      ...nodeMethods(nativeNode),
      get onended() {
        return endedHandler;
      },
      set onended(value) {
        endedHandler = value;
        nativeNode.onended = value;
      },
      get buffer() {
        return nativeNode.buffer === null
          ? null
          : wrapBuffer(nativeNode.buffer);
      },
      set buffer(value) {
        if (value === null) {
          nativeNode.buffer = null;
          return;
        }
        const nativeBuffer = nativeBuffers.get(value);
        if (nativeBuffer === undefined) {
          throw new Error("AUDIO_BROWSER_BUFFER_UNKNOWN");
        }
        nativeNode.buffer = nativeBuffer;
      },
      start(when) {
        if (when === undefined) nativeNode.start();
        else nativeNode.start(when);
      },
      stop(when) {
        if (when === undefined) nativeNode.stop();
        else nativeNode.stop(when);
      },
    };
    return registerNode(port, nativeNode);
  }

  function wrapAnalyser(nativeNode: AnalyserNode): AnalyserNodePort {
    const port: AnalyserNodePort = {
      ...nodeMethods(nativeNode),
      get fftSize() {
        return nativeNode.fftSize;
      },
      set fftSize(value) {
        nativeNode.fftSize = value;
      },
      get frequencyBinCount() {
        return nativeNode.frequencyBinCount;
      },
      get smoothingTimeConstant() {
        return nativeNode.smoothingTimeConstant;
      },
      set smoothingTimeConstant(value) {
        nativeNode.smoothingTimeConstant = value;
      },
      getFloatTimeDomainData(target) {
        nativeNode.getFloatTimeDomainData(target);
      },
    };
    return registerNode(port, nativeNode);
  }

  const nativeDestination = nativeContext.destination;
  const destination: AudioDestinationNodePort = registerNode(
    {
      ...nodeMethods(nativeDestination),
      get maximumChannelCount() {
        return nativeDestination.maxChannelCount;
      },
    },
    nativeDestination,
  );

  let stateHandler: (() => void) | null = null;
  const contextPort: AudioContextPort = {
    get sampleRate() {
      return nativeContext.sampleRate;
    },
    get currentTime() {
      return nativeContext.currentTime;
    },
    destination,
    get state() {
      return lifecycle.state();
    },
    get onstatechange() {
      return stateHandler;
    },
    set onstatechange(value) {
      stateHandler = value;
      lifecycle.setStateHandler(value);
    },
    createGain() {
      return wrapGain(nativeContext.createGain());
    },
    createBiquadFilter() {
      return wrapFilter(nativeContext.createBiquadFilter());
    },
    createOscillator() {
      return wrapOscillator(nativeContext.createOscillator());
    },
    createDynamicsCompressor() {
      return wrapCompressor(nativeContext.createDynamicsCompressor());
    },
    createWaveShaper() {
      return wrapWaveShaper(nativeContext.createWaveShaper());
    },
    createConvolver() {
      return wrapConvolver(nativeContext.createConvolver());
    },
    createBuffer(numberOfChannels, length, sampleRate) {
      const nativeBuffer = nativeContext.createBuffer(
        numberOfChannels,
        length,
        sampleRate,
      );
      observation.bufferCreated?.(nativeBuffer);
      return wrapBuffer(nativeBuffer);
    },
    createBufferSource() {
      return wrapBufferSource(nativeContext.createBufferSource());
    },
    createAnalyser() {
      return wrapAnalyser(nativeContext.createAnalyser());
    },
    createPeriodicWave(real, imaginary, options: PeriodicWaveOptionsPort) {
      const nativeWave = nativeContext.createPeriodicWave(real, imaginary, {
        disableNormalization: options.disableNormalization,
      });
      const port: PeriodicWavePort = Object.freeze({});
      nativeWaves.set(port, nativeWave);
      return port;
    },
    resume() {
      return lifecycle.resume();
    },
    close() {
      return lifecycle.close();
    },
  };
  return contextPort;
}

function createNativeContext(options: AudioContextOptionsPort): AudioContext {
  if (typeof globalThis.AudioContext !== "function") {
    throw new Error("AUDIO_BROWSER_CONTEXT_UNAVAILABLE");
  }
  return new globalThis.AudioContext({ latencyHint: options.latencyHint });
}

export function createBrowserAudioPlatform(): AudioPlatform {
  return Object.freeze({
    createContext(options) {
      const nativeContext = createNativeContext(options);
      return createNativeAudioContextPort(nativeContext, {
        state: () => normalizeContextState(nativeContext.state),
        setStateHandler: (handler) => {
          nativeContext.onstatechange = handler;
        },
        resume: () => nativeContext.resume(),
        close: () => nativeContext.close(),
      });
    },
  });
}
