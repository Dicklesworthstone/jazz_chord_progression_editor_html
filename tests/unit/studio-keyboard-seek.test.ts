import { expect, test } from "bun:test";
import { createStudioAudio, createStudioComposition, seedStarterChart } from "../../src/application/runtime";
import { makeBeatPosition } from "../../src/domain";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";

const gesture = { kind: "trusted-pointer", trusted: true, sequence: 1 } as const;
async function until(predicate: () => boolean): Promise<void> {
  for (let turn = 0; turn < 400; turn += 1) {
    if (predicate()) return;
    await Bun.sleep(5);
  }
  throw new Error("Exact keyboard seek did not settle");
}
function position(numerator: number, denominator = 1) {
  const made = makeBeatPosition({ numerator, denominator });
  if (!made.ok) throw new Error("Invalid test beat");
  return made.value;
}
function setup(meter?: readonly [number, number]) {
  const fake = createFakeAudioPlatform();
  const audio = createStudioAudio(fake.platform);
  const made = createStudioComposition({ audio });
  if (!made.ok) throw new Error(made.refusal.code);
  const { controller } = made.composition;
  if (meter === undefined) {
    expect(seedStarterChart(controller).seeded).toBe(true);
  } else {
    expect(controller.setMeter(...meter).ok).toBe(true);
    const section = controller.getSnapshot().sections[0];
    const measure = section?.measures[0];
    if (section === undefined || measure === undefined) throw new Error("Missing empty chart");
    // Meter changes are document edits, so the first-open seed correctly
    // refuses this non-pristine chart. Insert two authored bars normally.
    for (const [text, target] of [
      ["| Cmaj7 |", { kind: "measure-start", measureId: measure.id }],
      ["| Dm7 |", { kind: "section-end", sectionId: section.id }],
    ] as const) {
      const preview = controller.previewChartText(text);
      expect(controller.setQuickEntryDraft(text, target, preview.status, preview.issueCodes).ok).toBe(true);
      expect(controller.applyQuickEntryPreview().ok).toBe(true);
    }
  }
  expect(controller.setInstrument("analog-poly").ok).toBe(true);
  return { fake, audio, controller, readState: made.composition.readApplicationState };
}

test("exact keyboard steps reach real paused X1 without changing document/history", async () => {
  const { controller, audio, fake, readState } = setup();
  expect(controller.playProgression(gesture).ok).toBe(true);
  await until(() => controller.getSnapshot().transport.status === "playing");
  expect(controller.pauseProgression().ok).toBe(true);
  await until(() => controller.getSnapshot().transport.status === "paused");
  const before = readState();
  try {
    const cases = [
      [4, 3, "ArrowRight", false, "7/3"],
      [4, 3, "ArrowLeft", false, "1/3"],
      [1, 960, "ArrowRight", false, "961/960"],
      [4, 3, "ArrowRight", true, "16/3"],
      [16, 3, "ArrowLeft", true, "4/3"],
      [4, 3, "PageUp", false, "16/3"],
      [16, 3, "PageDown", true, "4/3"],
      [1, 3, "ArrowLeft", false, "0/1"],
      [71, 3, "ArrowRight", false, "24/1"],
      [4, 3, "Home", false, "0/1"],
      [4, 3, "End", false, "24/1"],
    ] as const;
    for (const [n, d, key, shift, expected] of cases) {
      expect(controller.seekToBeat(position(n, d)).ok).toBe(true);
      await until(() => controller.getSnapshot().transport.playheadBeatLabel === `${String(n)}/${String(d)}`);
      expect(controller.seekFromKeyboard(key, shift).ok).toBe(true);
      await until(() => controller.getSnapshot().transport.playheadBeatLabel === expected);
      const [expectedN, expectedD] = expected.split("/").map(Number);
      if (expectedN === undefined || expectedD === undefined) throw new Error("Invalid expected beat");
      expect(audio.inspect().transport.pausedBeat).toEqual(position(expectedN, expectedD));
      expect(controller.getSnapshot().transport.status).toBe("paused");
      expect(audio.inspect().transport.queuedCommandCount).toBe(0);
      expect(readState().document).toBe(before.document);
      expect(readState().history).toBe(before.history);
      expect(readState().revision).toBe(before.revision);
    }
  } finally {
    controller.stopProgression();
    await until(() => controller.getSnapshot().transport.status === "ready");
    fake.contexts[0]?.finishAllSources();
  }
});

test("ready keyboard steps compose on the pending exact start and Play consumes it", async () => {
  const { controller, fake, readState } = setup();
  expect(controller.playProgression(gesture).ok).toBe(true);
  await until(() => controller.getSnapshot().transport.status === "playing");
  controller.stopProgression();
  await until(() => controller.getSnapshot().transport.status === "ready");
  const before = readState();
  expect(controller.seekToBeat(position(4, 3)).ok).toBe(true);
  expect(controller.seekFromKeyboard("ArrowRight", false).ok).toBe(true);
  expect(controller.readPendingRunStartBeats()).toBe(7 / 3);
  expect(controller.seekFromKeyboard("ArrowRight", false).ok).toBe(true);
  expect(controller.readPendingRunStartBeats()).toBe(10 / 3);
  expect(controller.seekFromKeyboard("ArrowLeft", false).ok).toBe(true);
  expect(controller.readPendingRunStartBeats()).toBe(7 / 3);
  expect(readState().document).toBe(before.document);
  expect(readState().history).toBe(before.history);
  expect(controller.playProgression(gesture).ok).toBe(true);
  await until(() => controller.getSnapshot().transport.status === "playing");
  expect(controller.getSnapshot().transport.playheadBeatLabel).toBe("7/3");
  expect(controller.readPendingRunStartBeats()).toBeNull();
  controller.stopProgression();
  await until(() => controller.getSnapshot().transport.status === "ready");
  fake.contexts[0]?.finishAllSources();
});

test("locked and unknown keyboard intents cannot move the playhead", () => {
  const { controller, readState } = setup();
  const before = readState();
  expect(controller.seekFromKeyboard("ArrowRight", false).ok).toBe(false);
  expect(controller.seekFromKeyboard("Space", false).ok).toBe(false);
  expect(controller.readPendingRunStartBeats()).toBeNull();
  expect(readState().transport.playhead).toEqual(before.transport.playhead);
  expect(readState().document).toBe(before.document);
  expect(readState().history).toBe(before.history);
});

test("Shift+Arrow in 6/8 advances one three-quarter-note bar", async () => {
  const { controller, audio, fake } = setup([6, 8]);
  controller.playProgression(gesture);
  await until(() => controller.getSnapshot().transport.status === "playing");
  controller.pauseProgression();
  await until(() => controller.getSnapshot().transport.status === "paused");
  try {
    controller.seekToBeat(position(1, 3));
    await until(() => controller.getSnapshot().transport.playheadBeatLabel === "1/3");
    expect(controller.seekFromKeyboard("ArrowRight", true).ok).toBe(true);
    await until(() => controller.getSnapshot().transport.playheadBeatLabel === "10/3");
    expect(audio.inspect().transport.pausedBeat).toEqual(position(10, 3));
  } finally {
    controller.stopProgression();
    await until(() => controller.getSnapshot().transport.status === "ready");
    fake.contexts[0]?.finishAllSources();
  }
});
