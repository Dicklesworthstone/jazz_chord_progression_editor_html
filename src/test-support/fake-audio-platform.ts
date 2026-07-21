import type {
  AudioBufferPort,
  AudioContextPort,
  AudioContextStatePort,
  AudioDestinationNodePort,
  AudioNodePort,
  AudioParamPort,
  AudioPlatform,
  BiquadFilterNodePort,
  ConvolverNodePort,
  DynamicsCompressorNodePort,
  GainNodePort,
  OscillatorNodePort,
  PeriodicWavePort,
  WaveShaperNodePort,
} from "../audio";

export type FakeAudioEvent = Readonly<{
  sequence: number;
  kind: string;
  subject: string;
  detail: string;
  value: number | string | null;
  atTimeSeconds: number | null;
}>;

export type FakeAudioPlatformOptions = Readonly<{
  sampleRate?: number;
  initialState?: AudioContextStatePort;
  resumeBehavior?: "running" | "suspended" | "reject" | "deferred";
  closeBehavior?: "resolve" | "reject" | "throw";
  failNodeCreationAt?: number | null;
  failContextCreation?: boolean;
  failStateRead?: boolean;
  failStateReadAt?: number;
  failSampleRateRead?: boolean;
  failSampleRateReadAt?: number;
  failStateHandlerAssignment?: boolean;
  rejectDirectCustomOscillatorType?: boolean;
}>;

export type FakeAudioContextController = Readonly<{
  port: AudioContextPort;
  contextId: string;
  setCurrentTime(value: number): void;
  setState(value: AudioContextStatePort, emit?: boolean): void;
  resolveDeferredResume(value?: "running" | "suspended"): void;
  rejectDeferredResume(): void;
  finishAllSources(): void;
  finishSource(sourceId: string): void;
  sourceIds(): readonly string[];
  nodeIds(): readonly string[];
  disconnectCount(nodeId: string): number;
  closeCount(): number;
}>;

export type FakeAudioPlatformHarness = Readonly<{
  platform: AudioPlatform;
  events: readonly FakeAudioEvent[];
  contexts: readonly FakeAudioContextController[];
  contextCreationCount(): number;
}>;

type NodeState = {
  readonly id: string;
  readonly kind: string;
  disconnects: number;
};

type SourceState = Readonly<{
  id: string;
  port: OscillatorNodePort;
}>;

type DeferredResume = Readonly<{
  resolve(): void;
  reject(error: Error): void;
}>;

function optionOr<Value>(value: Value | undefined, fallback: Value): Value {
  return value === undefined ? fallback : value;
}

function createFakeContext(
  contextNumber: number,
  options: FakeAudioPlatformOptions,
  record: (
    kind: string,
    subject: string,
    detail: string,
    value?: number | string | null,
    atTimeSeconds?: number | null,
  ) => void,
): FakeAudioContextController {
  const contextId = `context-${String(contextNumber)}`;
  const nodeStates = new WeakMap<AudioNodePort, NodeState>();
  const nodeStatesById = new Map<string, NodeState>();
  const sources = new Map<string, SourceState>();
  let nodeSequence = 0;
  let waveSequence = 0;
  let currentTime = 0;
  let state = optionOr(options.initialState, "running");
  let stateHandler: (() => void) | null = null;
  let nodeCreationCount = 0;
  let stateReadCount = 0;
  let sampleRateReadCount = 0;
  let contextCloseCount = 0;
  let deferredResume: DeferredResume | null = null;

  const registerNode = <Node extends AudioNodePort>(
    port: Node,
    kind: string,
  ): Node => {
    nodeCreationCount += 1;
    if (options.failNodeCreationAt === nodeCreationCount) {
      throw new Error("FAKE_AUDIO_NODE_CREATION_FAILED");
    }
    nodeSequence += 1;
    const id = `${contextId}:${kind}-${String(nodeSequence)}`;
    const nodeState: NodeState = { id, kind, disconnects: 0 };
    nodeStates.set(port, nodeState);
    nodeStatesById.set(id, nodeState);
    record("node-create", id, kind);
    return port;
  };

  function requireNode(port: AudioNodePort): NodeState {
    const nodeState = nodeStates.get(port);
    if (nodeState === undefined) throw new Error("FAKE_AUDIO_NODE_UNKNOWN");
    return nodeState;
  }

  function createNodeMethods(self: () => AudioNodePort): AudioNodePort {
    return {
      connect(destination, output, input) {
        const source = requireNode(self());
        const target = requireNode(destination);
        record(
          "node-connect",
          source.id,
          target.id,
          `${String(output ?? 0)}:${String(input ?? 0)}`,
        );
      },
      connectParam(destination, output) {
        const source = requireNode(self());
        record(
          "param-connect",
          source.id,
          destinationName(destination),
          output ?? 0,
        );
      },
      disconnect() {
        const source = requireNode(self());
        source.disconnects += 1;
        record("node-disconnect", source.id, source.kind, source.disconnects);
      },
    };
  }

  const parameterNames = new WeakMap<AudioParamPort, string>();
  function destinationName(parameter: AudioParamPort): string {
    return parameterNames.get(parameter) ?? "unknown-param";
  }

  function createParameter(name: string, initialValue = 0): AudioParamPort {
    let value = initialValue;
    const port: AudioParamPort = {
      get value() {
        return value;
      },
      set value(next) {
        value = next;
        record("param-value", name, "assign", next, null);
      },
      setValueAtTime(next, atTimeSeconds) {
        value = next;
        record("param-event", name, "set", next, atTimeSeconds);
        return port;
      },
      linearRampToValueAtTime(next, atTimeSeconds) {
        value = next;
        record("param-event", name, "linear", next, atTimeSeconds);
        return port;
      },
      exponentialRampToValueAtTime(next, atTimeSeconds) {
        value = next;
        record("param-event", name, "exponential", next, atTimeSeconds);
        return port;
      },
      setTargetAtTime(next, atTimeSeconds, timeConstant) {
        value = next;
        record(
          "param-event",
          name,
          `target:${String(timeConstant)}`,
          next,
          atTimeSeconds,
        );
        return port;
      },
      cancelScheduledValues(atTimeSeconds) {
        record("param-event", name, "cancel", null, atTimeSeconds);
        return port;
      },
      cancelAndHoldAtTime(atTimeSeconds) {
        record("param-event", name, "hold", value, atTimeSeconds);
        return port;
      },
    };
    parameterNames.set(port, name);
    return port;
  }

  function createGain(): GainNodePort {
    const methods = createNodeMethods(() => port);
    const port: GainNodePort = {
      ...methods,
      gain: createParameter(
        `${contextId}:gain-${String(nodeSequence + 1)}.gain`,
        1,
      ),
    };
    return registerNode(port, "gain");
  }

  function createFilter(): BiquadFilterNodePort {
    const methods = createNodeMethods(() => port);
    let filterType: BiquadFilterNodePort["type"] = "lowpass";
    const port: BiquadFilterNodePort = {
      ...methods,
      get type() {
        return filterType;
      },
      set type(value) {
        filterType = value;
        record("node-setting", requireNode(port).id, "type", value);
      },
      frequency: createParameter(
        `${contextId}:filter-${String(nodeSequence + 1)}.frequency`,
        350,
      ),
      detune: createParameter(
        `${contextId}:filter-${String(nodeSequence + 1)}.detune`,
      ),
      q: createParameter(
        `${contextId}:filter-${String(nodeSequence + 1)}.q`,
        1,
      ),
      gain: createParameter(
        `${contextId}:filter-${String(nodeSequence + 1)}.gain`,
      ),
    };
    return registerNode(port, "filter");
  }

  function createOscillator(): OscillatorNodePort {
    const methods = createNodeMethods(() => port);
    let oscillatorType: OscillatorNodePort["type"] = "sine";
    let endedHandler: (() => void) | null = null;
    const port: OscillatorNodePort = {
      ...methods,
      get onended() {
        return endedHandler;
      },
      set onended(value) {
        endedHandler = value;
      },
      get type() {
        return oscillatorType;
      },
      set type(value) {
        if (
          value === "custom" &&
          options.rejectDirectCustomOscillatorType === true
        ) {
          throw new Error("FAKE_AUDIO_CUSTOM_TYPE_REQUIRES_PERIODIC_WAVE");
        }
        oscillatorType = value;
        record("node-setting", requireNode(port).id, "type", value);
      },
      frequency: createParameter(
        `${contextId}:oscillator-${String(nodeSequence + 1)}.frequency`,
        440,
      ),
      detune: createParameter(
        `${contextId}:oscillator-${String(nodeSequence + 1)}.detune`,
      ),
      setPeriodicWave() {
        oscillatorType = "custom";
        record("node-setting", requireNode(port).id, "periodic-wave");
      },
      start(atTimeSeconds = 0) {
        record(
          "source-start",
          requireNode(port).id,
          "start",
          null,
          atTimeSeconds,
        );
      },
      stop(atTimeSeconds = 0) {
        record(
          "source-stop",
          requireNode(port).id,
          "stop",
          null,
          atTimeSeconds,
        );
      },
    };
    registerNode(port, "oscillator");
    const sourceId = requireNode(port).id;
    sources.set(sourceId, { id: sourceId, port });
    return port;
  }

  function createCompressor(): DynamicsCompressorNodePort {
    const methods = createNodeMethods(() => port);
    const port: DynamicsCompressorNodePort = {
      ...methods,
      threshold: createParameter(
        `${contextId}:compressor-${String(nodeSequence + 1)}.threshold`,
        -24,
      ),
      knee: createParameter(
        `${contextId}:compressor-${String(nodeSequence + 1)}.knee`,
        30,
      ),
      ratio: createParameter(
        `${contextId}:compressor-${String(nodeSequence + 1)}.ratio`,
        12,
      ),
      attack: createParameter(
        `${contextId}:compressor-${String(nodeSequence + 1)}.attack`,
        0.003,
      ),
      release: createParameter(
        `${contextId}:compressor-${String(nodeSequence + 1)}.release`,
        0.25,
      ),
      reduction: 0,
    };
    return registerNode(port, "compressor");
  }

  function createWaveShaper(): WaveShaperNodePort {
    const methods = createNodeMethods(() => port);
    let curve: Float32Array | null = null;
    let oversample: WaveShaperNodePort["oversample"] = "none";
    const port: WaveShaperNodePort = {
      ...methods,
      get curve() {
        return curve;
      },
      set curve(value) {
        curve = value;
        record(
          "node-setting",
          requireNode(port).id,
          "curve-length",
          value?.length ?? 0,
        );
      },
      get oversample() {
        return oversample;
      },
      set oversample(value) {
        oversample = value;
        record("node-setting", requireNode(port).id, "oversample", value);
      },
    };
    return registerNode(port, "waveshaper");
  }

  function createConvolver(): ConvolverNodePort {
    const methods = createNodeMethods(() => port);
    let buffer: AudioBufferPort | null = null;
    let normalize = true;
    const port: ConvolverNodePort = {
      ...methods,
      get buffer() {
        return buffer;
      },
      set buffer(value) {
        buffer = value;
        record(
          "node-setting",
          requireNode(port).id,
          "buffer-length",
          value?.length ?? 0,
        );
      },
      get normalize() {
        return normalize;
      },
      set normalize(value) {
        normalize = value;
        record("node-setting", requireNode(port).id, "normalize", String(value));
      },
    };
    return registerNode(port, "convolver");
  }

  const destinationMethods = createNodeMethods(() => destination);
  const destination: AudioDestinationNodePort = registerNode(
    { ...destinationMethods, maximumChannelCount: 2 },
    "destination",
  );

  const sampleRate = optionOr(options.sampleRate, 48_000);
  const port: AudioContextPort = {
    get sampleRate() {
      sampleRateReadCount += 1;
      if (
        options.failSampleRateRead === true ||
        options.failSampleRateReadAt === sampleRateReadCount
      ) {
        throw new Error("FAKE_AUDIO_SAMPLE_RATE_READ_FAILED");
      }
      return sampleRate;
    },
    get currentTime() {
      return currentTime;
    },
    destination,
    get state() {
      stateReadCount += 1;
      if (
        options.failStateRead === true ||
        options.failStateReadAt === stateReadCount
      ) {
        throw new Error("FAKE_AUDIO_STATE_READ_FAILED");
      }
      return state;
    },
    get onstatechange() {
      return stateHandler;
    },
    set onstatechange(value) {
      if (options.failStateHandlerAssignment === true) {
        throw new Error("FAKE_AUDIO_STATE_HANDLER_ASSIGNMENT_FAILED");
      }
      stateHandler = value;
    },
    createGain,
    createBiquadFilter: createFilter,
    createOscillator,
    createDynamicsCompressor: createCompressor,
    createWaveShaper,
    createConvolver,
    createBuffer(numberOfChannels, length, requestedSampleRate) {
      const channels = Array.from(
        { length: numberOfChannels },
        () => new Float32Array(length),
      );
      const buffer: AudioBufferPort = {
        numberOfChannels,
        length,
        sampleRate: requestedSampleRate,
        duration: length / requestedSampleRate,
        getChannelData(channel) {
          const data = channels[channel];
          if (data === undefined) throw new Error("FAKE_AUDIO_CHANNEL_INVALID");
          return data;
        },
      };
      record("buffer-create", contextId, "buffer", length);
      return buffer;
    },
    createPeriodicWave() {
      waveSequence += 1;
      const wave: PeriodicWavePort = Object.freeze({
        fakePeriodicWaveId: `${contextId}:wave-${String(waveSequence)}`,
      });
      record("wave-create", contextId, "periodic-wave", waveSequence);
      return wave;
    },
    resume() {
      record("context-resume", contextId, "resume");
      const behavior = optionOr(options.resumeBehavior, "running");
      if (behavior === "reject") {
        return Promise.reject(new Error("FAKE_AUDIO_RESUME_REJECTED"));
      }
      if (behavior === "deferred") {
        return new Promise<void>((resolve, reject) => {
          deferredResume = { resolve, reject };
        });
      }
      state = behavior;
      stateHandler?.();
      return Promise.resolve();
    },
    close() {
      contextCloseCount += 1;
      const behavior = optionOr(options.closeBehavior, "resolve");
      if (behavior === "throw") {
        throw new Error("FAKE_AUDIO_CLOSE_THROWN");
      }
      if (behavior === "reject") {
        return Promise.reject(new Error("FAKE_AUDIO_CLOSE_REJECTED"));
      }
      state = "closed";
      record("context-close", contextId, "close", contextCloseCount);
      stateHandler?.();
      return Promise.resolve();
    },
  };

  function setState(next: AudioContextStatePort, emit = true): void {
    state = next;
    record("context-state", contextId, "state", next);
    if (emit) stateHandler?.();
  }

  function finishSource(sourceId: string): void {
    const source = sources.get(sourceId);
    if (source === undefined) throw new Error("FAKE_AUDIO_SOURCE_UNKNOWN");
    record("source-ended", sourceId, "ended");
    source.port.onended?.();
  }

  return Object.freeze({
    port,
    contextId,
    setCurrentTime(value) {
      currentTime = value;
    },
    setState,
    resolveDeferredResume(value = "running") {
      const pending = deferredResume;
      if (pending === null) throw new Error("FAKE_AUDIO_RESUME_NOT_DEFERRED");
      deferredResume = null;
      state = value;
      stateHandler?.();
      pending.resolve();
    },
    rejectDeferredResume() {
      const pending = deferredResume;
      if (pending === null) throw new Error("FAKE_AUDIO_RESUME_NOT_DEFERRED");
      deferredResume = null;
      pending.reject(new Error("FAKE_AUDIO_RESUME_REJECTED"));
    },
    finishAllSources() {
      for (const sourceId of sources.keys()) finishSource(sourceId);
    },
    finishSource,
    sourceIds() {
      return Object.freeze([...sources.keys()]);
    },
    nodeIds() {
      return Object.freeze([...nodeStatesById.keys()]);
    },
    disconnectCount(nodeId) {
      return nodeStatesById.get(nodeId)?.disconnects ?? 0;
    },
    closeCount() {
      return contextCloseCount;
    },
  });
}

export function createFakeAudioPlatform(
  options: FakeAudioPlatformOptions = {},
): FakeAudioPlatformHarness {
  const mutableEvents: FakeAudioEvent[] = [];
  const mutableContexts: FakeAudioContextController[] = [];
  let eventSequence = 0;
  let contextCreationCount = 0;
  const record = (
    kind: string,
    subject: string,
    detail: string,
    value: number | string | null = null,
    atTimeSeconds: number | null = null,
  ): void => {
    eventSequence += 1;
    mutableEvents.push(
      Object.freeze({
        sequence: eventSequence,
        kind,
        subject,
        detail,
        value,
        atTimeSeconds,
      }),
    );
  };
  const platform: AudioPlatform = Object.freeze({
    createContext() {
      contextCreationCount += 1;
      record(
        "context-create",
        `context-${String(contextCreationCount)}`,
        "context",
      );
      if (options.failContextCreation === true) {
        throw new Error("FAKE_AUDIO_CONTEXT_CREATION_FAILED");
      }
      const controller = createFakeContext(
        contextCreationCount,
        options,
        record,
      );
      mutableContexts.push(controller);
      return controller.port;
    },
  });
  return Object.freeze({
    platform,
    get events() {
      return mutableEvents;
    },
    get contexts() {
      return mutableContexts;
    },
    contextCreationCount() {
      return contextCreationCount;
    },
  });
}
