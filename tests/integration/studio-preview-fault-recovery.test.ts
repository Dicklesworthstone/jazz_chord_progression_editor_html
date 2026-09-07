import { expect, test } from "bun:test";
import { createStudioAudio } from "../../src/application/runtime";
import type { TransportServiceNotification } from "../../src/audio";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import { makeMidiPitch, parseStableId } from "../../src/domain";

/** Real X0/X1 over a platform that throws once at source admission. */
test("a preview source fault publishes one failed notification and the next gesture recovers", async () => {
  const fake = createFakeAudioPlatform();
  let fail = true;
  const audio = createStudioAudio({ createContext: options => {
    const context = fake.platform.createContext(options);
    return { ...context, createOscillator: () => {
      const source = context.createOscillator();
      return { ...source, start: (...args) => {
        if (fail) { fail = false; throw new Error("Injected source admission fault"); }
        source.start(...args);
      } };
    } };
  } });
  const notes = makeMidiPitch(60), id = parseStableId("document", "u2-native-fault");
  if (!notes.ok || !id.ok) throw new Error("Invalid independent note/identity");
  const notifications: TransportServiceNotification[] = [];
  audio.subscribe(value => { notifications.push(value); });
  const gesture = { kind: "trusted-pointer", trusted: true, sequence: 1 } as const;
  expect((await audio.initialize(1, gesture, id.value, 0)).termination).toBe("receipt");
  expect(await audio.prepareInstrument("mellow-keys", [{ midiPitch: notes.value, velocity: 0.8, gateSeconds: 1 }])).toBe(true);
  const failed = await audio.startPreview(2, "x1:preview:fault", "mellow-keys", [notes.value], 1);
  expect(failed.termination).toBe("fault");
  expect(audio.inspect().engine.state).toBe("fault");
  expect(audio.inspect().transport.state).toBe("fault");
  expect(notifications.filter(value => value.status === "failed")).toHaveLength(1);
  expect(audio.isInitialized()).toBe(false);
  expect((await audio.initialize(3, { ...gesture, sequence: 2 }, id.value, 0)).termination).toBe("receipt");
  expect(await audio.prepareInstrument("mellow-keys", [{ midiPitch: notes.value, velocity: 0.8, gateSeconds: 1 }])).toBe(true);
  expect((await audio.startPreview(4, "x1:preview:recovered", "mellow-keys", [notes.value], 1)).termination).toBe("receipt");
  expect(audio.inspect().engine.state).toBe("ready");
  expect((await audio.releasePreview(5, "x1:preview:recovered")).termination).toBe("receipt");
  expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(0);
  expect(notifications.filter(value => value.status === "failed")).toHaveLength(1);
  // X0 §2 explicitly replaces an unusable faulted context on a later gesture.
  // This is the fatal recovery edge, not an ordinary Stop/restart graph churn.
  expect(fake.contextCreationCount()).toBe(2);
  expect(fake.contexts[0]?.closeCount()).toBe(1);
  expect(fake.contexts[1]?.closeCount()).toBe(0);
});
