import { expect, test } from "bun:test";
import { createStudioCompositionOverState } from "../../src/application/studio-controller";
import { compileStudioPlaybackPlan } from "../../src/application/studio-playback";
import { createStudioAudio, type StudioAudioPort } from "../../src/application/studio-audio";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import { loopArrangementFixture } from "../support/loop-arrangement-fixture";

async function until(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  throw new Error("Audition did not reach its named checkpoint");
}
const gesture = { kind: "trusted-keyboard", trusted: true, sequence: 1 } as const;
for (const lane of ["notes", "midi-pitches", "midi-plan"] as const)
  for (const failure of ["refusal", "throw"] as const)
    for (const continuation of ["retry", "retry twice", "other panel", "preparing again"] as const) {
      test(`${lane} retains failed ${failure} release: ${continuation}`, async () => {
        const fixture = loopArrangementFixture(), audio = createStudioAudio(createFakeAudioPlatform().platform);
        const starts: string[] = [], releases: string[] = [];
        let failures = continuation === "retry twice" || continuation === "preparing again" ? 2 : 1;
        let hold = false, entered = false, completed = false;
        let finish: () => void = () => { throw new Error("Missing preparation latch"); };
        const gate = new Promise<void>(resolve => { finish = resolve; });
        const port: StudioAudioPort = { ...audio,
          async prepareInstrument(...args) {
            if (hold) { entered = true; await gate; completed = true; }
            return audio.prepareInstrument(...args);
          },
          startPreview(...args) { starts.push(args[1]); return audio.startPreview(...args); },
          async releasePreview(requestId, previewId) {
            releases.push(previewId);
            if (failures > 0) {
              failures--;
              if (failure === "throw") throw new Error("Injected release failure");
              return audio.releasePreview(-1, previewId);
            }
            return audio.releasePreview(requestId, previewId);
          },
        };
        const composition = createStudioCompositionOverState(fixture.state, fixture.dependencies, { audio: port });
        const controller = composition.controller, before = composition.readApplicationState();
        const compiled = compileStudioPlaybackPlan(before.document);
        if (!compiled.ok) throw new Error("Invalid positive playback fixture");
        const start = async (): Promise<boolean> => lane === "notes"
          ? controller.previewNoteFirst("C4 E4 G4 C4", gesture).ok
          : lane === "midi-pitches" ? controller.midiImportPreview.pitches([60, 64, 67], gesture).ok
            : (await controller.midiImportPreview.plan(compiled.plan, gesture)).ok;
        const release = () => lane === "notes" ? controller.releaseNoteFirst() : controller.midiImportPreview.release();
        try {
          expect(await start()).toBe(true);
          await until(() => starts.length === 1 && audio.inspect().engine.previewNonreleasingVoiceCount > 0);
          const owned = starts[0]; if (owned === undefined) throw new Error("No audition submission");
          expect((await release()).ok).toBe(false);
          expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBeGreaterThan(0);
          if (continuation === "other panel") {
            expect(lane === "notes" ? controller.midiImportPreview.pitches([72], gesture).ok
              : controller.previewNoteFirst("C5", gesture).ok).toBe(true);
            await until(() => starts.length === 2 && audio.inspect().engine.previewNonreleasingVoiceCount === 1);
            const calls = releases.length;
            expect((await release()).ok).toBe(true);
            expect(releases).toHaveLength(calls);
            expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(1);
            expect((await (lane === "notes" ? controller.midiImportPreview.release() : controller.releaseNoteFirst())).ok).toBe(true);
          } else {
            if (continuation === "retry twice") {
              expect((await release()).ok).toBe(false);
              expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBeGreaterThan(0);
            }
            if (continuation === "preparing again") {
              hold = true; const pending = start(); await until(() => entered);
              expect((await release()).ok).toBe(true);
              finish(); await pending; await until(() => completed);
              expect(starts).toHaveLength(1);
            } else expect((await release()).ok).toBe(true);
            expect(releases).toEqual(Array.from({ length: continuation === "retry twice" || continuation === "preparing again" ? 3 : 2 }, () => owned));
          }
          expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(0);
          expect(controller.getSnapshot().previewStoppable).toBe(false);
          const calls = releases.length; expect((await release()).ok).toBe(true); expect(releases).toHaveLength(calls);
          expect(composition.readApplicationState().document).toBe(before.document);
          expect(composition.readApplicationState().history).toBe(before.history);
          expect(composition.readApplicationState().revision).toBe(before.revision);
        } finally {
          finish(); await audio.transportService.submitTransportCommand({ commandRequestId: 999,
            payload: { kind: "dispose-transport", reason: "page-teardown" } });
        }
      }, 30000);
    }
