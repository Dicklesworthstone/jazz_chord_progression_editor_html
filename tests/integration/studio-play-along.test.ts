import { expect, test } from "bun:test";
import { makeBeatPosition, type BeatPosition } from "../../src/domain";
import { createStudioControllerOverState, createStudioCompositionOverState } from "../../src/application/studio-controller";
import { createStudioLocalReplacement, createX1SerializedTransportRetirementAdapter } from "../../src/application";
import { createRecoveryHarness } from "../support/recovery-test-kit";
import { createStudioAudio } from "../../src/application/runtime";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import { loopArrangementFixture } from "../support/loop-arrangement-fixture";

function exactPosition(beat: BeatPosition): readonly [number, number] {
  return [beat.numerator, beat.denominator];
}

async function until(predicate: () => boolean) {
  for (let i=0; i<400 && !predicate(); i++) await new Promise(resolve => setTimeout(resolve,5));
  expect(predicate()).toBe(true);
}
test("display follows actual transport authority and refuses stale revisions", async () => {
  const fixture = loopArrangementFixture();
  const inner = createStudioAudio(createFakeAudioPlatform().platform);
  const controller = createStudioControllerOverState(fixture.state,fixture.dependencies,{audio:inner});
  const initial = controller.getSnapshot();
  expect(controller.readPlayAlong().current).toBeNull();
  try {
    expect(controller.playProgression({kind:"trusted-pointer",trusted:true,sequence:1}).ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "playing");
    expect(controller.readPlayAlong().current).toBe("Cmaj7");
    expect(controller.readPlayAlong().next).toBe("Dm7");
    for (let i=0;i<10;i++) controller.readPlayAlong();
    expect(controller.getSnapshot().revision).toBe(initial.revision);
    expect(controller.getSnapshot().history).toEqual(initial.history);
    expect(controller.pauseProgression().ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "paused");
    const paused = controller.readPlayAlong();
    expect(paused.status).toBe("Paused");
    expect(controller.readPlayAlong()).toEqual(paused);
    expect(controller.setTitle("Changed source authority").ok).toBe(true);
    expect(controller.readPlayAlong().current).toBeNull();
  } finally { await inner.transportService.submitTransportCommand({commandRequestId:999,payload:{kind:"dispose-transport",reason:"page-teardown"}}); }
},30000);

test("count-in holds the starting cue; actual loop and seek control next labels", async () => {
  const fixture = loopArrangementFixture();
  const platform = createFakeAudioPlatform();
  const inner = createStudioAudio(platform.platform);
  const controller = createStudioControllerOverState(fixture.state,fixture.dependencies,{audio:inner});
  try {
    expect(controller.playProgression({kind:"trusted-pointer",trusted:true,sequence:1}).ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "playing");
    expect(controller.stopProgression().ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "ready");
    expect(controller.setCountInEnabled(true).ok).toBe(true);
    await until(() => controller.readClickToggles().countInEnabled);
    expect(controller.toggleLoop().ok).toBe(true);
    const target = fixture.state.document.sections[1]?.measures[0]?.events[0];
    if (target === undefined) throw new Error("Missing second chord");
    const beat = makeBeatPosition({numerator:4,denominator:1});
    if (!beat.ok) throw new Error(beat.refusal.code);
    expect(controller.seekToBeat(beat.value).ok).toBe(true);
    expect(controller.playProgression({kind:"trusted-pointer",trusted:true,sequence:2}).ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "playing");
    const context = platform.contexts[0];
    if (context === undefined) throw new Error("Missing audio clock");
    context.setCurrentTime(0.5);
    const held = controller.readPlayAlong();
    expect([held.current,held.next,held.bar,held.pulse]).toEqual(["Dm7","Cmaj7",2,1]);
    context.setCurrentTime(1.5);
    expect(controller.readPlayAlong().pulse).toBe(3);
  } finally { await inner.transportService.submitTransportCommand({commandRequestId:999,payload:{kind:"dispose-transport",reason:"page-teardown"}}); }
},30000);


test("ready cue follows the chosen next start without advancing audio", async () => {
  const fixture = loopArrangementFixture();
  const inner = createStudioAudio(createFakeAudioPlatform().platform);
  const controller = createStudioControllerOverState(fixture.state, fixture.dependencies, { audio: inner });
  try {
    expect(controller.playProgression({ kind: "trusted-pointer", trusted: true, sequence: 1 }).ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "playing");
    expect(controller.stopProgression().ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "ready");
    const before = controller.getSnapshot();
    expect(controller.readPlayAlong().current).toBe("Cmaj7");
    const position = makeBeatPosition({ numerator: 5, denominator: 1 });
    if (!position.ok) throw new Error(position.refusal.code);
    expect(controller.seekToBeat(position.value).ok).toBe(true);
    const cue = controller.readPlayAlong();
    console.info(JSON.stringify({ witness: "ready-start-cue", pending: controller.readPendingRunStartBeats(), audio: inner.readPlayheadBeat(), cue }));
    expect(cue).toMatchObject({ status: "Starting position", current: "Dm7", next: null, bar: 2, pulse: 2 });
    expect(exactPosition(inner.readPlayheadBeat())).toEqual([0, 1]);
    expect(controller.getSnapshot().revision).toBe(before.revision);
    expect(controller.getSnapshot().history).toEqual(before.history);
    expect(controller.playProgression({ kind: "trusted-pointer", trusted: true, sequence: 2 }).ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "playing");
    expect(controller.readPlayAlong()).toMatchObject({ current: "Dm7", bar: 2, pulse: 2 });
    expect(controller.readPendingRunStartBeats()).toBeNull();
  } finally { await inner.transportService.submitTransportCommand({ commandRequestId: 999, payload: { kind: "dispose-transport", reason: "page-teardown" } }); }
}, 30000);

test("a changed source cannot inherit a pending next-run start", async () => {
  const fixture = loopArrangementFixture();
  const inner = createStudioAudio(createFakeAudioPlatform().platform);
  const controller = createStudioControllerOverState(fixture.state, fixture.dependencies, { audio: inner });
  try {
    expect(controller.playProgression({ kind: "trusted-pointer", trusted: true, sequence: 1 }).ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "playing");
    expect(controller.stopProgression().ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "ready");
    const position = makeBeatPosition({ numerator: 5, denominator: 1 });
    if (!position.ok) throw new Error(position.refusal.code);
    expect(controller.seekToBeat(position.value).ok).toBe(true);
    expect(controller.setTitle("A new source revision").ok).toBe(true);
    const pending = controller.readPendingRunStartBeats();
    const staleCue = controller.readPlayAlong();
    expect(controller.playProgression({ kind: "trusted-pointer", trusted: true, sequence: 2 }).ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "playing");
    const actual = controller.readPlayAlong();
    console.info(JSON.stringify({ witness: "pending-source-authority", pending, staleCue, actual, playhead: inner.readPlayheadBeat() }));
    expect(pending).toBeNull();
    expect(staleCue.current).toBeNull();
    expect(actual).toMatchObject({ current: "Cmaj7", bar: 1, pulse: 1 });
    expect(exactPosition(inner.readPlayheadBeat())).toEqual([0, 1]);
  } finally { await inner.transportService.submitTransportCommand({ commandRequestId: 999, payload: { kind: "dispose-transport", reason: "page-teardown" } }); }
}, 30000);


test("ready next-chord cues use newly armed and disarmed loops", async () => {
  const fixture = loopArrangementFixture();
  const inner = createStudioAudio(createFakeAudioPlatform().platform);
  const controller = createStudioControllerOverState(fixture.state, fixture.dependencies, { audio: inner });
  try {
    expect(controller.playProgression({ kind: "trusted-pointer", trusted: true, sequence: 1 }).ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "playing");
    expect(controller.stopProgression().ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "ready");
    expect(controller.toggleLoop().ok).toBe(true);
    const position = makeBeatPosition({ numerator: 5, denominator: 1 });
    if (!position.ok) throw new Error(position.refusal.code);
    expect(controller.seekToBeat(position.value).ok).toBe(true);
    const armed = controller.readPlayAlong();
    expect(controller.playProgression({ kind: "trusted-pointer", trusted: true, sequence: 2 }).ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "playing");
    const playing = controller.readPlayAlong();
    expect(controller.stopProgression().ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "ready");
    expect(controller.toggleLoop().ok).toBe(true);
    const disarmed = controller.readPlayAlong();
    console.info(JSON.stringify({ witness: "ready-loop-intent", armed, playing, disarmed, actualLoop: inner.inspect().transport.loop }));
    expect(armed).toMatchObject({ status: "Starting position", current: "Dm7", next: "Cmaj7", bar: 2, pulse: 2 });
    expect(playing).toMatchObject({ current: "Dm7", next: "Cmaj7" });
    expect(disarmed).toMatchObject({ status: "Starting position", current: "Dm7", next: null, bar: 2, pulse: 2 });
  } finally { await inner.transportService.submitTransportCommand({ commandRequestId: 999, payload: { kind: "dispose-transport", reason: "page-teardown" } }); }
}, 30000);

for (const action of ["refusal", "undo", "redo", "edit-undo", "setting-receipt", "ignored-notification", "accepted-notification"] as const) {
  test(`pending start respects ${action} authority`, async () => {
    const fixture = loopArrangementFixture();
    const inner = createStudioAudio(createFakeAudioPlatform().platform);
    let replayNotification: (() => void) | undefined;
    const composition = createStudioCompositionOverState(fixture.state, fixture.dependencies, {
      audio: { ...inner, subscribe: listener => inner.subscribe(notification => {
        replayNotification = () => { listener(notification); };
        listener(notification);
      }) },
    });
    const { controller } = composition;
    const preserved = action === "refusal" || action === "setting-receipt" || action === "ignored-notification";
    try {
      if (action === "undo" || action === "redo") {
        expect(controller.setTitle("An undoable title").ok).toBe(true);
        if (action === "redo") expect(controller.undo().ok).toBe(true);
      }
      expect(controller.playProgression({ kind: "trusted-pointer", trusted: true, sequence: 1 }).ok).toBe(true);
      await until(() => controller.getSnapshot().transport.status === "playing");
      expect(controller.stopProgression().ok).toBe(true);
      await until(() => controller.getSnapshot().transport.status === "ready");
      const position = makeBeatPosition({ numerator: 5, denominator: 1 });
      if (!position.ok) throw new Error(position.refusal.code);
      expect(controller.seekToBeat(position.value).ok).toBe(true);
      if (action === "refusal") expect(controller.setTempo(-1).ok).toBe(false);
      else if (action === "undo") expect(controller.undo().ok).toBe(true);
      else if (action === "redo") expect(controller.redo().ok).toBe(true);
      else if (action === "edit-undo") {
        const original = composition.readApplicationState().document;
        expect(controller.setTitle("Temporary edit").ok).toBe(true);
        expect(controller.undo().ok).toBe(true);
        expect(composition.readApplicationState().document).toEqual(original);
      } else if (action === "setting-receipt") {
        // A setting receipt does not publish a transport notification.
        const before = composition.readApplicationState().transport.notificationSequence;
        expect(controller.setCountInEnabled(true).ok).toBe(true);
        await until(() => controller.readClickToggles().countInEnabled);
        expect(composition.readApplicationState().transport.notificationSequence).toBe(before);
      } else if (action === "ignored-notification") {
        const before = composition.readApplicationState();
        if (replayNotification === undefined) throw new Error("Missing prior real notification");
        replayNotification();
        expect(composition.readApplicationState()).toBe(before);
      } else {
        const before = composition.readApplicationState().transport.notificationSequence;
        // Submit via the real composition-private FIFO, without calling the
        // controller's explicit Stop clearing path.
        await inner.stop(composition.allocateTransportCommandRequestId());
        expect(composition.readApplicationState().transport.notificationSequence).toBeGreaterThan(before);
      }
      expect(controller.readPendingRunStartBeats()).toBe(preserved ? 5 : null);
      expect(controller.playProgression({ kind: "trusted-pointer", trusted: true, sequence: 2 }).ok).toBe(true);
      await until(() => controller.getSnapshot().transport.status === "playing");
      expect(controller.readPlayAlong().current).toBe(preserved ? "Dm7" : "Cmaj7");
      expect(exactPosition(inner.readPlayheadBeat())).toEqual([preserved ? 5 : 0, 1]);
    } finally { await inner.transportService.submitTransportCommand({ commandRequestId: 999, payload: { kind: "dispose-transport", reason: "page-teardown" } }); }
  }, 30000);
}

test("ready section-loop and end cues do not invent a clamped start", async () => {
  const fixture = loopArrangementFixture();
  const inner = createStudioAudio(createFakeAudioPlatform().platform);
  const controller = createStudioControllerOverState(fixture.state, fixture.dependencies, { audio: inner });
  try {
    expect(controller.playProgression({ kind: "trusted-pointer", trusted: true, sequence: 1 }).ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "playing");
    expect(controller.stopProgression().ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "ready");
    expect(controller.armSectionLoop("loop-section-1").ok).toBe(true);
    for (const [numerator, current, next] of [[0, null, null], [4, "Dm7", "Dm7"], [8, null, null]] as const) {
      const beat = makeBeatPosition({ numerator, denominator: 1 });
      if (!beat.ok) throw new Error(beat.refusal.code);
      expect(controller.seekToBeat(beat.value).ok).toBe(true);
      expect(controller.readPlayAlong()).toMatchObject({ current, next });
      expect(controller.readPendingRunStartBeats()).toBe(numerator);
      expect(exactPosition(inner.readPlayheadBeat())).toEqual([0, 1]);
    }
    expect(controller.armSectionLoop("loop-section-1").ok).toBe(true);
    expect(controller.readPlayAlong().current).toBeNull();
  } finally { await inner.transportService.submitTransportCommand({ commandRequestId: 999, payload: { kind: "dispose-transport", reason: "page-teardown" } }); }
}, 30000);


test("a real lesson replacement and its Undo cannot resurrect a pending start", async () => {
  const fixture = loopArrangementFixture();
  const inner = createStudioAudio(createFakeAudioPlatform().platform);
  const composition = createStudioCompositionOverState(fixture.state, fixture.dependencies, { audio: inner });
  const { controller } = composition;
  const replacement = createStudioLocalReplacement({
    composition, recovery: createRecoveryHarness().service, exportCurrent: () => {},
    retirement: createX1SerializedTransportRetirementAdapter(inner.transportService, composition.allocateTransportCommandRequestId, {
      beforeSubmit: composition.replacementWorkflow.expectTransportRetirement,
      settled: composition.replacementWorkflow.settleTransportRetirement,
    }),
  });
  try {
    expect(controller.playProgression({ kind: "trusted-pointer", trusted: true, sequence: 1 }).ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "playing");
    expect(controller.stopProgression().ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "ready");
    const beat = makeBeatPosition({ numerator: 5, denominator: 1 });
    if (!beat.ok) throw new Error(beat.refusal.code);
    expect(controller.seekToBeat(beat.value).ok).toBe(true);
    await replacement.requestLesson("two-five-one");
    await replacement.confirm(false);
    expect(replacement.getSnapshot().open).toBe(false);
    expect(composition.readApplicationState().document).not.toEqual(fixture.state.document);
    expect(controller.readPendingRunStartBeats()).toBeNull();
    expect(controller.undo().ok).toBe(true);
    expect(composition.readApplicationState().document).toEqual(fixture.state.document);
    expect(controller.readPendingRunStartBeats()).toBeNull();
    expect(controller.playProgression({ kind: "trusted-pointer", trusted: true, sequence: 2 }).ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "playing");
    expect(controller.readPlayAlong().current).toBe("Cmaj7");
    expect(exactPosition(inner.readPlayheadBeat())).toEqual([0, 1]);
  } finally { await inner.transportService.submitTransportCommand({ commandRequestId: 999, payload: { kind: "dispose-transport", reason: "page-teardown" } }); }
}, 30000);

// 41/320 quarter notes is exactly 123 MIDI ticks. Converting to a double
// and back produces 122.99999999999999, just before the arriving chord.
test("ready and live cues preserve an exact fractional chord boundary", async () => {
  const fixture = loopArrangementFixture();
  const { publishA0Candidate } = await import("../support/a0-application-fixture");
  const document = publishA0Candidate({ ...fixture.state.document,
    sections: fixture.state.document.sections.map((section, index) => index !== 0 ? section : {
      ...section, measures: section.measures.map(measure => ({ ...measure,
        completion: { kind: "pickup", expectedDuration: { numerator: 41, denominator: 320 }, reason: "Exact boundary witness" },
        events: measure.events.map(event => ({ ...event, duration: { numerator: 41, denominator: 320 } })),
      })),
    }),
  });
  const inner = createStudioAudio(createFakeAudioPlatform().platform);
  const controller = createStudioControllerOverState({ ...fixture.state, document }, fixture.dependencies, { audio: inner });
  try {
    expect(controller.playProgression({ kind: "trusted-pointer", trusted: true, sequence: 1 }).ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "playing");
    expect(controller.stopProgression().ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "ready");
    for (const [ticks, chord, bar] of [[122, "Cmaj7", 1], [123, "Dm7", 2], [124, "Dm7", 2]] as const) {
      const position = makeBeatPosition({ numerator: ticks, denominator: 960 });
      if (!position.ok) throw new Error(position.refusal.code);
      expect(controller.seekToBeat(position.value).ok).toBe(true);
      expect(controller.readPlayAlong()).toMatchObject({ current: chord, bar, pulse: 1 });
    }
    const boundary = makeBeatPosition({ numerator: 41, denominator: 320 });
    if (!boundary.ok) throw new Error(boundary.refusal.code);
    expect(controller.seekToBeat(boundary.value).ok).toBe(true);
    expect(controller.playProgression({ kind: "trusted-pointer", trusted: true, sequence: 2 }).ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "playing");
    expect(inner.readPlayheadBeat()).toEqual(boundary.value);
    expect(controller.readPlayAlong()).toMatchObject({ status: "Play along", current: "Dm7", bar: 2, pulse: 1 });
    expect(controller.pauseProgression().ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "paused");
    expect(controller.readPlayAlong()).toMatchObject({ status: "Paused", current: "Dm7", bar: 2, pulse: 1 });
  } finally { await inner.transportService.submitTransportCommand({ commandRequestId: 999, payload: { kind: "dispose-transport", reason: "page-teardown" } }); }
}, 30000);
