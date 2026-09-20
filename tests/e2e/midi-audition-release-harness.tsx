import { render } from "preact";
import { createStudioComposition, createStudioAudio, createStudioMidiImport, type StudioController } from "../../src/application/runtime";
import { loadSmfWasmDecoder } from "../../src/audio/runtime";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import { StudioRoot } from "../../src/ui/App";

type Outcome = "success" | "refusal" | "throw";
declare global { interface Window { midiReleaseProof: {
  arm: () => void; settle: (outcome: Outcome) => Promise<void>; calls: () => number;
  revision: () => number; voices: () => number;
}; } }
// Real UI, MIDI decoder, application and X1; only the release result is held.
// The fake audio clock keeps the bounded excerpt alive for deterministic races.
const audio = createStudioAudio(createFakeAudioPlatform().platform);
const created = createStudioComposition({ audio });
if (!created.ok) throw new Error(created.refusal.code);
const original = created.composition.controller;
// This clock-only platform has no rendered piano buffers. Use the real
// oscillator instrument, whose preparation and release run on this platform.
const instrument = original.setInstrument("analog-poly");
if (!instrument.ok) throw new Error("Could not select the proof instrument");
let armed = false, calls = 0;
let resolveHeld: ((outcome: Outcome) => void) | null = null;
const controller: StudioController = { ...original, midiImportPreview: { ...original.midiImportPreview,
  release: async () => {
    calls++;
    if (armed) {
      armed = false;
      const outcome = await new Promise<Outcome>(resolve => { resolveHeld = resolve; });
      if (outcome === "throw") throw new Error("Injected release rejection");
      if (outcome === "refusal") return { ok: false, code: "proof.release_refused", message: "Release refused. Use Stop to retire audio." };
    }
    return original.midiImportPreview.release();
  },
} };
window.midiReleaseProof = {
  arm: () => { armed = true; },
  settle: async outcome => { if (resolveHeld === null) throw new Error("No held release"); const resolve = resolveHeld; resolveHeld = null; resolve(outcome); await new Promise<void>(done => setTimeout(done, 0)); },
  calls: () => calls,
  revision: () => original.getSnapshot().revision,
  voices: () => audio.inspect().engine.previewNonreleasingVoiceCount,
};
render(<StudioRoot controller={controller} midiImport={createStudioMidiImport(loadSmfWasmDecoder)} />, document.body);
