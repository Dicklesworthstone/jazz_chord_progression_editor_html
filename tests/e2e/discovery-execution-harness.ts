import { type AudioContextPort, type TransportCommandOutcome } from "../../src/audio";
import { createBrowserAudioPlatform } from "../../src/audio/runtime";
import { createStudioAudio } from "../../src/application/studio-audio";
import { compileStudioPlaybackPlan } from "../../src/application/studio-playback";
import { undoDocumentCommand, type DiscoveryApplyResult, type DiscoveryStartResult, type DiscoveryJobService } from "../../src/application";
import { createDiscoveryStepper, type DiscoveryValue } from "../../src/theory";
import { annotationDraft, discoveryApplicationFixture } from "../support/discovery-application-fixture";

// This UI drives the generic protocol, not a completed discovery product UI.
// All sound, retirement, task scheduling and A0 publication are production paths.
const platform = createBrowserAudioPlatform();
const contexts: AudioContextPort[] = [];
const audio = createStudioAudio({ createContext(options) {
  const context = platform.createContext(options); contexts.push(context); return context;
} });
let audioSequence = 0, jobSequence = 0, expansions = 0, slow = false, holdRetirement = false;
let releaseRetirement: (() => void) | null = null;
let startResult: DiscoveryStartResult | null = null, applyResult: DiscoveryApplyResult | null = null;
let disposed = false, inputWhileBusy = false;
const errors: string[] = [];
const transport: { action: string; outcome: TransportCommandOutcome }[] = [];
const jobViews: ReturnType<DiscoveryJobService["inspect"]>[] = [];

const NativeChannel = globalThis.MessageChannel;
const livePorts = new Set<MessagePort>();
let postedMessages = 0, deliveredMessages = 0;
class ObservedChannel extends NativeChannel {
  constructor() {
    super();
    for (const port of [this.port1, this.port2]) {
      livePorts.add(port);
      const close = port.close.bind(port), post = port.postMessage.bind(port);
      const delivered = (): void => { deliveredMessages += 1; };
      port.addEventListener("message", delivered);
      Object.defineProperty(port, "postMessage", { value: (value: unknown) => { postedMessages += 1; post(value); } });
      Object.defineProperty(port, "close", { value: () => {
        port.removeEventListener("message", delivered); livePorts.delete(port); close();
      } });
    }
  }
}
Object.defineProperty(globalThis, "MessageChannel", { value: ObservedChannel });

const liveIntervals = new Set<number>();
const nativeInterval = window.setInterval.bind(window), nativeClearInterval = window.clearInterval.bind(window);
Object.defineProperty(globalThis, "setInterval", { value: (callback: TimerHandler, delay?: number, ...args: unknown[]) => {
  const id = nativeInterval(callback, delay, ...args); liveIntervals.add(id); return id;
} });
Object.defineProperty(globalThis, "clearInterval", { value: (id: number | undefined) => {
  if (id !== undefined) liveIntervals.delete(id); nativeClearInterval(id);
} });

function receipt(action: string, outcome: TransportCommandOutcome): void {
  transport.push({ action, outcome });
  if (outcome.termination !== "receipt") throw new Error(`${action}:${outcome.code}`);
}
async function stopAudio(action: string): Promise<boolean> {
  const outcome = await audio.stop(++audioSequence); receipt(action, outcome);
  const actual = audio.inspect();
  return outcome.termination === "receipt" && outcome.noFutureAttackPostcondition &&
    actual.transport.state === "ready" && actual.engine.progressionNonreleasingVoiceCount === 0 && actual.engine.previewNonreleasingVoiceCount === 0;
}
function coordinate(value: DiscoveryValue): Readonly<{ branch: number; left: number }> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || !("branch" in value) || !("left" in value) ||
    typeof value["branch"] !== "number" || typeof value["left"] !== "number") throw new Error("Invalid finite protocol coordinate");
  return { branch: value["branch"], left: value["left"] };
}
const fixture = discoveryApplicationFixture({ quantum: 1,
  create: (request, arena) => {
    expansions = 0;
    const branches = slow ? 128 : 1, length = slow ? 128 : 3;
    return createDiscoveryStepper(request, arena, { family: "protocol", maximumWorkspaceBytes: 65536,
      seed: (_request, sink) => {
        for (let branch = 0; branch < branches; branch += 1) if (!sink.enqueue(() => ({ branch, left: length - 1 }))) break;
      },
      expand: (value, _request, sink) => {
        expansions += 1;
        const point = coordinate(value);
        if (point.left > 0) sink.enqueue(() => ({ ...point, left: point.left - 1 }));
        else if (point.branch === branches - 1) sink.offer(annotationDraft);
      },
    });
  },
  retire: async () => {
    const retired = await stopAudio("apply-retirement");
    // A synchronization barrier AFTER the real retirement lets the browser
    // drive edits/Stop during the application's real awaited publication leg.
    if (holdRetirement) await new Promise<void>(resolve => { releaseRetirement = resolve; render(); });
    releaseRetirement = null;
    return retired;
  },
});
const originalDocument = JSON.stringify(fixture.original.document);
const releases: (() => void)[] = [];
const elements = new Map<string, HTMLElement>();
const root = document.createElement("main");
root.innerHTML = `<h1>Discovery execution proof</h1>
<p>Finite protocol fixture over the real application, browser scheduler and audio transport.</p>
<label>Scratch note <input id="scratch"></label><label>Chart title <input id="title"></label>
<div class="controls"><button id="play">Play &amp; preview</button><button id="fast">Find option</button>
<button id="slow">Long search</button><button id="apply">Apply option</button><button id="undo">Undo</button>
<button id="edit">Edit title</button><button id="stop">Stop</button><button id="continue">Continue Apply</button></div>
<label><input id="hold" type="checkbox"> Hold Apply after real Stop</label>
<output id="status" aria-live="polite"></output><pre id="result"></pre>`;
document.body.append(root);
for (const element of root.querySelectorAll<HTMLElement>("[id]")) elements.set(element.id, element);
function element(id: string): HTMLElement {
  const value = elements.get(id); if (value === undefined) throw new Error(`Missing proof element:${id}`); return value;
}
function input(id: string): HTMLInputElement {
  const value = element(id); if (!(value instanceof HTMLInputElement)) throw new Error(`Missing proof input:${id}`); return value;
}
input("title").value = fixture.read().document.title;
function render(): void {
  const view = fixture.service.inspect();
  element("status").textContent = disposed ? "disposed" : view.status;
  element("result").textContent = JSON.stringify({ revision: fixture.read().revision, expansions,
    search: startResult === null ? null : startResult.ok ? startResult.result.kind : startResult.refusal.code,
    apply: applyResult?.kind ?? null, retirementHeld: releaseRetirement !== null, errors }, null, 2);
  document.documentElement.dataset["discoveryStatus"] = disposed ? "disposed" : view.status;
}
releases.push(fixture.service.subscribe(view => { jobViews.push(view); render(); }));
function listen(id: string, event: string, action: (event: Event) => void | Promise<void>): void {
  const node = element(id);
  const handler = (event: Event): void => {
    Promise.resolve(action(event)).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message); console.error(message); render();
    });
  };
  node.addEventListener(event, handler); releases.push(() => { node.removeEventListener(event, handler); });
}
async function start(long: boolean): Promise<void> {
  slow = long; startResult = null; applyResult = null; inputWhileBusy = false;
  const state = fixture.read();
  const request = { ...fixture.request, identity: { ...fixture.request.identity,
    requestId: `native.${String(++jobSequence)}`, documentId: state.document.id, sourceRevision: state.revision } };
  startResult = await fixture.service.start(request); render();
}
listen("scratch", "input", () => { if (fixture.service.inspect().status === "running") inputWhileBusy = true; });
listen("hold", "change", () => { holdRetirement = input("hold").checked; });
listen("fast", "click", () => start(false)); listen("slow", "click", () => start(true));
listen("play", "click", async event => {
  if (!event.isTrusted) throw new Error("Audio initialization requires the actual browser click");
  const state = fixture.read(), compiled = compileStudioPlaybackPlan(state.document);
  if (!compiled.ok) throw new Error(compiled.refusal.code);
  const initialization = await audio.initialize(++audioSequence, { kind: "trusted-pointer", trusted: true, sequence: 1 }, state.document.id, state.revision);
  receipt("initialize", initialization);
  if (!audio.isInitialized()) throw new Error("Native audio did not reach ready");
  const binding = { plan: compiled.plan, documentId: state.document.id, planRevision: state.revision };
  const first = compiled.plan.events[0];
  if (first === undefined) throw new Error("Independent playback plan is empty");
  const prepared = await audio.prepareInstrument(state.document.playback.instrumentId,
    compiled.plan.events.flatMap(row => row.midiPitches.map(midiPitch => ({ midiPitch, velocity: row.velocity }))), binding);
  if (!prepared) throw new Error("Native instrument preparation refused");
  receipt("play", await audio.play(++audioSequence, binding, first.startBeat, false));
  receipt("preview", await audio.startPreview(++audioSequence, "x1:preview:discovery", state.document.playback.instrumentId, first.midiPitches, 1));
  render();
});
listen("apply", "click", async () => { applyResult = await fixture.service.apply("option.0"); render(); });
listen("undo", "click", () => {
  const result = undoDocumentCommand({ state: fixture.read() });
  if (!result.ok) throw new Error(result.refusal.code); fixture.write(result.state); render();
});
listen("edit", "click", () => { fixture.editTitle(input("title").value); render(); });
listen("stop", "click", async () => { fixture.service.cancel(); if (!(await stopAudio("user-stop"))) throw new Error("Native Stop failed"); render(); });
listen("continue", "click", () => { releaseRetirement?.(); });

function snapshot() {
  const state = fixture.read();
  return { schema: "changes.evidence.discovery-browser.v1", disposed, inputWhileBusy, errors: [...errors],
    document: state.document, documentBytes: JSON.stringify(state.document), originalDocument,
    revision: state.revision, historyEntries: state.history.undo.length, recovery: state.recovery, exportRevision: state.exportRevision,
    pendingRequests: state.pendingRequests, expansions, startResult, applyResult, job: fixture.service.inspect(),
    jobViews: [...jobViews], transport: [...transport], audio: audio.inspect(),
    native: { contexts: contexts.length, contextListeners: contexts.filter(context => context.onstatechange !== null).length,
      messagePorts: livePorts.size, messageHandlers: [...livePorts].filter(port => port.onmessage !== null).length,
      postedMessages, deliveredMessages, intervals: liveIntervals.size, uiListeners: releases.length,
      retirementHeld: releaseRetirement !== null },
  };
}
async function dispose(): Promise<void> {
  fixture.service.dispose(); releaseRetirement?.();
  for (const release of releases) release(); releases.length = 0;
  receipt("dispose", await audio.transportService.submitTransportCommand({ commandRequestId: ++audioSequence,
    payload: { kind: "dispose-transport", reason: "page-teardown" } }));
  disposed = true; render();
}
export type DiscoveryBrowserApi = Readonly<{ snapshot: typeof snapshot; dispose: typeof dispose }>;
Object.defineProperty(globalThis, "__JCPE_DISCOVERY__", { value: Object.freeze({ snapshot, dispose }) });
render();
