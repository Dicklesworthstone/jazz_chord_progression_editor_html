import { describe, expect, test } from "bun:test";
import { parseChordSymbol } from "../../src/theory";
import { createStudioBootstrap } from "../../src/application/studio-bootstrap";
import { createStudioControllerOverState } from "../../src/application/studio-controller";
import { createStudioAudio, type StudioAudioPort, type StudioController } from "../../src/application/runtime";
import { inspectorEvent, inspectorState } from "../support/u2-inspector-fixtures";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";

const gesture = { kind: "trusted-pointer", trusted: true, sequence: 1 } as const;
function controller(audio?: StudioAudioPort) {
  const bootstrap = createStudioBootstrap(), chord = parseChordSymbol("Cmaj7", "ascii");
  if (!bootstrap.ok || !chord.ok) throw new Error("Invalid positive setup");
  return createStudioControllerOverState(inspectorState(inspectorEvent({ id: "u2-controller-chord", annotation: "Original 🎹",
    chord: chord.chord, voicing: { mode: "auto", family: "balanced", voiceCount: 4,
      range: { lowMidi: 48, highMidi: 84 }, bassPolicy: "generated" } })), bootstrap.value.dependencies,
    audio === undefined ? {} : { audio });
}
function view(actions: StudioController) {
  const result = actions.readInspector("u2-controller-chord");
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}
async function until(predicate: () => boolean) {
  for (let n = 0; n < 80; n++) { if (predicate()) return; await new Promise<void>(resolve => setTimeout(resolve, 0)); }
  throw new Error("Inspector preview did not reach named checkpoint");
}

describe("U2 real application command bridge", () => {
  test("Keep, Undo and Redo preserve the event's exact identity, source, annotation and time", () => {
    const actions = controller(), before = view(actions), candidate = before.choices[0];
    if (!candidate) throw new Error("No positive candidate");
    expect(actions.applyInspectorChange(before.source, { kind: "freeze", choice: candidate, confirmed: false }).ok).toBe(true);
    const after = view(actions);
    expect(after.event).toMatchObject({ id: before.event.id, chord: before.event.chord,
      duration: before.event.duration, annotation: before.event.annotation,
      voicing: { mode: "frozen", pitches: candidate.pitches, generatedBy: candidate.generatedBy } });
    expect(actions.undo().ok).toBe(true);
    expect(view(actions).event).toEqual(before.event);
    expect(actions.redo().ok).toBe(true);
    expect(view(actions).event).toEqual(after.event);
    expect(actions.applyInspectorChange(before.source, { kind: "annotation", text: "stale overwrite" })).toMatchObject({ ok: false, refusal: { code: "u2.stale_source" } });
    expect(view(actions).event).toEqual(after.event);
  });

  test("Manual duplicates, confirmed Auto return and Undo retain ordered notes", () => {
    const actions = controller(), before = view(actions);
    const pitches = [{ step: "G", alter: 0, octave: 4 }, { step: "C", alter: 0, octave: 4 }, { step: "C", alter: 0, octave: 4 }] as const;
    expect(actions.applyInspectorChange(before.source, { kind: "manual", pitches, bassPolicy: "included" }).ok).toBe(true);
    const manual = view(actions), candidate = manual.choices[0];
    if (!candidate) throw new Error("No valid explicit Auto policy");
    expect(manual.event.voicing).toMatchObject({ mode: "manual", pitches });
    expect(actions.applyInspectorChange(manual.source, { kind: "auto", policy: candidate.policy, confirmed: false })).toMatchObject({ ok: false, refusal: { code: "u2.mode_switch_requires_confirmation" } });
    expect(view(actions).event).toEqual(manual.event);
    expect(actions.applyInspectorChange(manual.source, { kind: "auto", policy: candidate.policy, confirmed: true }).ok).toBe(true);
    expect(view(actions).detail.voicing.activePitches).toEqual(candidate.pitches);
    expect(actions.undo().ok).toBe(true);
    expect(view(actions).event).toEqual(manual.event);
  });

  test("annotation Apply is one Undo and preserves literal markup and astral text", () => {
    const actions = controller(), original = view(actions), text = "<script>literal</script>" + "🎹".repeat(1976);
    expect(Array.from(text).length).toBe(2000);
    expect(actions.applyInspectorChange(original.source, { kind: "annotation", text })).toMatchObject({ ok: true });
    const after = view(actions);
    expect(after.event.annotation).toBe(text);
    expect(actions.applyInspectorChange(after.source, { kind: "annotation", text: text + "🎹" }).ok).toBe(false);
    expect(view(actions).event.annotation).toBe(text);
    expect(actions.undo().ok).toBe(true);
    expect(view(actions).event).toEqual(original.event);
  });

  test("invalid symbols and changed selection cannot mutate the chord", () => {
    const actions = controller(), before = view(actions);
    expect(actions.applyInspectorChange(before.source, { kind: "symbol", text: "!?", confirmed: false }).ok).toBe(false);
    expect(actions.clearSelection().ok).toBe(true);
    expect(actions.applyInspectorChange(before.source, { kind: "annotation", text: "wrong owner" })).toMatchObject({ ok: false, refusal: { code: "u2.selection_changed" } });
    expect(view(actions).event).toEqual(before.event);
  });
});

describe("U2 preview ownership over X1", () => {
  for (const retire of ["close", "edit", "selection", "stop"] as const) test(`${retire} during preparation prevents every late attack`, async () => {
    const real = createStudioAudio(createFakeAudioPlatform().platform);
    let release: () => void = () => { throw new Error("Uninitialized gate"); };
    let preparing = false, starts = 0;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const audio: StudioAudioPort = { ...real, prepareInstrument: async () => { preparing = true; await gate; return true; },
      startPreview: (...args) => { starts++; return real.startPreview(...args); } };
    const actions = controller(audio), before = view(actions);
    const pending = actions.previewInspector(before.source, { kind: "current" }, gesture);
    await until(() => preparing);
    if (retire === "close") await actions.releaseInspectorPreview(before.source);
    if (retire === "edit") expect(actions.applyInspectorChange(before.source, { kind: "annotation", text: "new revision" }).ok).toBe(true);
    if (retire === "selection") expect(actions.clearSelection().ok).toBe(true);
    if (retire === "stop") expect(actions.stopProgression().ok).toBe(true);
    release();
    expect(await pending).toMatchObject({ ok: false, code: "u2.preview_cancelled" });
    expect(starts).toBe(0);
  });

  test("16 Manual occurrences reach the real serialized preview unchanged, then release", async () => {
    const real = createStudioAudio(createFakeAudioPlatform().platform), observed: number[][] = [], released: string[] = [];
    const audio: StudioAudioPort = { ...real, prepareInstrument: () => Promise.resolve(true),
      startPreview: (...args) => { observed.push([...args[3]]); return real.startPreview(...args); },
      releasePreview: (...args) => { released.push(args[1]); return real.releasePreview(...args); } };
    const actions = controller(audio), before = view(actions), snapshot = actions.getSnapshot();
    const pitches = Array.from({ length: 16 }, (_, i) => ({ step: "C" as const, alter: 0 as const, octave: i % 2 ? 4 : 5 }));
    expect(await actions.previewInspector(before.source, { kind: "manual", pitches, bassPolicy: "included" }, gesture)).toMatchObject({ ok: true });
    expect(observed).toEqual([[72, 60, 72, 60, 72, 60, 72, 60, 72, 60, 72, 60, 72, 60, 72, 60]]);
    expect(actions.getSnapshot().revision).toBe(snapshot.revision);
    expect(actions.getSnapshot().bookmarks).toEqual(snapshot.bookmarks);
    expect(actions.getSnapshot().transport).toEqual(snapshot.transport);
    expect(actions.getSnapshot().previewStoppable).toBe(true);
    expect(await actions.releaseInspectorPreview(before.source)).toMatchObject({ ok: true });
    expect(released.length).toBe(1);
    expect(actions.getSnapshot().previewStoppable).toBe(false);
    expect(view(actions).event).toEqual(before.event);
  });

  test("a rejected adapter promise returns an error and a later preview can succeed", async () => {
    const real = createStudioAudio(createFakeAudioPlatform().platform);
    let failing = true;
    const actions = controller({ ...real, prepareInstrument: () => failing ? Promise.reject(new Error("Injected adapter rejection")) : Promise.resolve(true) });
    const source = view(actions).source;
    expect(await actions.previewInspector(source, { kind: "current" }, gesture)).toMatchObject({ ok: false, code: "u2.preview_adapter_failed" });
    failing = false;
    expect(await actions.previewInspector(source, { kind: "current" }, gesture)).toMatchObject({ ok: true });
    await actions.releaseInspectorPreview(source);
  });

  test("closing an older inspector preview cannot cancel a newer single-pitch preview", async () => {
    const real = createStudioAudio(createFakeAudioPlatform().platform), pitches: number[][] = [], released: string[] = [];
    const actions = controller({ ...real, prepareInstrument: () => Promise.resolve(true),
      startPreview: (...args) => { pitches.push([...args[3]]); return real.startPreview(...args); },
      releasePreview: (...args) => { released.push(args[1]); return real.releasePreview(...args); } });
    const source = view(actions).source;
    expect((await actions.previewInspector(source, { kind: "current" }, gesture)).ok).toBe(true);
    expect(actions.previewPitch(62, gesture).ok).toBe(true);
    await until(() => pitches.length === 2);
    await actions.releaseInspectorPreview(source);
    expect(pitches[1]).toEqual([62]);
    expect(released.every(id => id.startsWith("x1:preview:inspector-"))).toBe(true);
    expect(actions.getSnapshot().previewStoppable).toBe(true);
    expect(actions.stopProgression().ok).toBe(true);
    await until(() => !actions.getSnapshot().previewStoppable);
  });

  test("release failures remain visible after the inspector closes and keep Stop available", async () => {
    const real = createStudioAudio(createFakeAudioPlatform().platform);
    const actions = controller({ ...real, prepareInstrument: () => Promise.resolve(true),
      releasePreview: () => Promise.reject(new Error("Injected release failure")) });
    const source = view(actions).source, before = view(actions).event;
    expect((await actions.previewInspector(source, { kind: "current" }, gesture)).ok).toBe(true);
    expect(await actions.releaseInspectorPreview(source)).toMatchObject({ ok: false, code: "u2.preview_release_failed" });
    expect(actions.getSnapshot().latestNotice).toMatchObject({ code: "u2.preview_release_failed" });
    expect(actions.getSnapshot().previewStoppable).toBe(true);
    expect(view(actions).event).toEqual(before);
    expect(actions.stopProgression().ok).toBe(true);
    await until(() => !actions.getSnapshot().previewStoppable);
  });

  test("an initialization rejection does not poison the next fresh gesture", async () => {
    const real = createStudioAudio(createFakeAudioPlatform().platform);
    let calls = 0;
    const actions = controller({ ...real, prepareInstrument: () => Promise.resolve(true),
      initialize: (...args) => ++calls === 1 ? Promise.reject(new Error("Injected initialization failure")) : real.initialize(...args) });
    const source = view(actions).source;
    expect(await actions.previewInspector(source, { kind: "current" }, gesture)).toMatchObject({ ok: false, code: "u2.preview_adapter_failed" });
    expect(actions.getSnapshot().previewStoppable).toBe(false);
    expect((await actions.previewInspector(source, { kind: "current" }, { ...gesture, sequence: 2 })).ok).toBe(true);
    expect(calls).toBe(2);
    await actions.releaseInspectorPreview(source);
  });
});
