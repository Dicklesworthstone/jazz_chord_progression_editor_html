import { render } from "preact";
import { createStudioCompositionOverState } from "../../src/application/studio-controller";
import { createMidiExportDownloadStart } from "../../src/ui/midi-export-delivery";
import { StudioRoot } from "../../src/ui/App";
import { loopArrangementFixture } from "../support/loop-arrangement-fixture";

declare global { interface Window { midiDismissalProof: {
  failCleanup: () => void; holdHash: () => void; finishHash: () => Promise<void>; finishDelivery: () => Promise<void>;
  state: () => string; revision: () => number; urls: () => { created: number; revoked: number };
}; } }
let holdHash = false, failCleanup = false;
let resolveHash: (() => void) | null = null, resolveDelivery: (() => void) | null = null;
let created = 0, revoked = 0;
const nativeDelivery = createMidiExportDownloadStart({
  createObjectUrl: blob => { created++; return URL.createObjectURL(blob); },
  revokeObjectUrl: url => {
    URL.revokeObjectURL(url); revoked++;
    // The native resource is retired, but the port cannot attest success.
    if (failCleanup) { failCleanup = false; throw new Error("Injected cleanup uncertainty"); }
  },
  createAnchor: () => document.createElement("a"),
  attachToDocument: anchor => { if (anchor instanceof HTMLAnchorElement) document.body.append(anchor); },
});
const fixture = loopArrangementFixture();
const composition = createStudioCompositionOverState(fixture.state, fixture.dependencies, {
  midiExportHashBytes: async bytes => {
    if (holdHash) { holdHash = false; await new Promise<void>(resolve => { resolveHash = resolve; }); }
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  },
  midiExportDelivery: request => {
    // Real native download and cleanup; only notification to the service waits.
    const started = nativeDelivery(request);
    const released = new Promise<void>(resolve => { resolveDelivery = resolve; });
    return { completion: Promise.all([started.completion, released]).then(([receipt]) => receipt) };
  },
});
const service = composition.midiExport;
if (service === null) throw new Error("MIDI export service missing");
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
window.midiDismissalProof = {
  failCleanup: () => { failCleanup = true; },
  holdHash: () => { holdHash = true; },
  finishHash: async () => { if (resolveHash === null) throw new Error("No pending hash"); resolveHash(); resolveHash = null; await tick(); },
  finishDelivery: async () => { if (resolveDelivery === null) throw new Error("No pending delivery"); resolveDelivery(); resolveDelivery = null; await tick(); },
  state: () => service.inspectRegistry().state,
  revision: () => composition.controller.getSnapshot().revision,
  urls: () => ({ created, revoked }),
};
render(<StudioRoot controller={composition.controller} midiExport={service} />, document.body);
