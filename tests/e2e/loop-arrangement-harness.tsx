import { render } from "preact";
import { StudioRoot } from "../../src/ui/runtime";
import { createBrowserAudioPlatform } from "../../src/audio/runtime";
import type { AudioContextPort, TransportCommandOutcome } from "../../src/audio";
import { createStudioAudio, type StudioAudioPort } from "../../src/application/studio-audio";
import { createStudioControllerOverState } from "../../src/application/studio-controller";
import type { PlaybackPlan } from "../../src/playback";
import { loopArrangementFixture } from "../support/loop-arrangement-fixture";

// Test-only composition of the actual UI/controller/native audio. Observers
// forward calls unchanged; no renderer, clock, node or receipt is mocked.
const contexts: AudioContextPort[] = [];
const starts: { when: number; observedAt: number; frequency: number }[] = [];
const platform = createBrowserAudioPlatform();
const inner = createStudioAudio({ createContext(options) {
  const context = platform.createContext(options); contexts.push(context);
  const createOscillator = context.createOscillator.bind(context);
  context.createOscillator = () => {
    const node = createOscillator(), start = node.start.bind(node);
    let frequency = node.frequency.value;
    const setFrequency = node.frequency.setValueAtTime.bind(node.frequency);
    node.frequency.setValueAtTime = (value, when) => { frequency = value; return setFrequency(value, when); };
    node.start = (when = 0) => { starts.push({ when, observedAt: context.currentTime, frequency }); start(when); };
    return node;
  };
  return context;
} });
const bindings: { action: string; plan: PlaybackPlan }[] = [];
const outcomes: { action: string; outcome: TransportCommandOutcome }[] = [];
async function record(action: string, pending: Promise<TransportCommandOutcome>): Promise<TransportCommandOutcome> {
  const outcome = await pending; outcomes.push({ action, outcome }); return outcome;
}
const audio: StudioAudioPort = { ...inner,
  play: (...args) => { bindings.push({ action: "play", plan: args[1].plan }); return record("play", inner.play(...args)); },
  setLoop: (...args) => { bindings.push({ action: "loop", plan: args[1].plan }); return record("loop", inner.setLoop(...args)); },
  setPerformance: (...args) => { bindings.push({ action: "groove", plan: args[1].plan }); return record("groove", inner.setPerformance(...args)); },
  setInstrument: (...args) => record("instrument", inner.setInstrument(...args)),
  stop: (...args) => record("stop", inner.stop(...args)),
};
const fixture = loopArrangementFixture();
const controller = createStudioControllerOverState(fixture.state, fixture.dependencies, { audio, nowMs: () => performance.now() });
const mount = (() => {
  const element = document.getElementById("app");
  if (!element) throw new Error("Missing app root");
  return element;
})();
mount.replaceChildren(); render(<StudioRoot controller={controller} />, mount);
function snapshot() {
  return { view: controller.getSnapshot(), audio: inner.inspect(), bindings: [...bindings], outcomes: [...outcomes], starts: [...starts],
    nativeContexts: contexts.length, nativeListeners: contexts.filter(context => context.onstatechange !== null).length,
    nativeTime: contexts[0]?.currentTime ?? 0 };
}
async function dispose() {
  render(null, mount);
  const outcome = await inner.transportService.submitTransportCommand({ commandRequestId: 1_000_000, payload: { kind: "dispose-transport", reason: "page-teardown" } });
  outcomes.push({ action: "dispose", outcome });
}
export type LoopArrangementBrowserApi = { snapshot: typeof snapshot; dispose: typeof dispose };
Object.defineProperty(globalThis, "__JCPE_LOOP__", { value: { snapshot, dispose } });
