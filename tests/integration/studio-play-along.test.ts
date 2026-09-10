import { expect, test } from "bun:test";
import { makeBeatPosition } from "../../src/domain";
import { createStudioControllerOverState } from "../../src/application/studio-controller";
import { createStudioAudio } from "../../src/application/runtime";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import { loopArrangementFixture } from "../support/loop-arrangement-fixture";

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
