import { describe, expect, test } from "bun:test";
import { createAudioEngine, createTransportService, type AudioAttackBatchRequest, type AudioEngineResult, type AudioAttackReceipt } from "../../src/audio";
import { makeMidiPitch, makeBeatPosition } from "../../src/domain";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import { createFakeTransportTimer, customPlan, initializePayload, planBinding, requireReceipt } from "../support/transport-test-kit";

function pitch(value: number) {
  const parsed = makeMidiPitch(value);
  if (!parsed.ok) throw new Error("TEST_PITCH_INVALID");
  return parsed.value;
}
function request(start: number, release: number, midiPitch = 60): AudioAttackBatchRequest {
  return { owner: { kind: "progression", generation: 1 }, eventId: "clock-event", instrumentId: "mellow-keys",
    startTimeSeconds: start, releaseTimeSeconds: release, voices: [{ voiceId: "clock-voice", midiPitch: pitch(midiPitch), velocity: 80 }] };
}
async function ready() {
  const fake = createFakeAudioPlatform();
  const engine = createAudioEngine(fake.platform);
  const initialized = await engine.initializeAudioEngine({ gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
    initialMix: { masterVolume: 0.8, reverbAmount: 0.2 } });
  if (!initialized.ok) throw new Error(initialized.refusal.code);
  const context = fake.contexts[0];
  if (context === undefined) throw new Error("TEST_CONTEXT_MISSING");
  context.setCurrentTime(2);
  return { engine, fake, context };
}

describe("explicit X0 late-attack catch-up", () => {
  // Independent absolute-time cases: the original 0.5-second gate survives a
  // missed start; future/current starts retain their literal timestamps.
  for (const midiPitch of [48, 60, 72]) for (const row of [
    { name: "late zero margin", start: 1, release: 1.5, margin: 0, expectedStart: 2, expectedRelease: 2.5 },
    { name: "late native margin", start: 1, release: 1.5, margin: 0.01, expectedStart: 2.01, expectedRelease: 2.51 },
    { name: "late maximum gate", start: 1, release: 601, margin: 0.01, expectedStart: 2.01, expectedRelease: 602.01 },
    { name: "current", start: 2, release: 2.5, margin: 0.02, expectedStart: 2, expectedRelease: 2.5 },
    { name: "future horizon", start: 2.25, release: 2.75, margin: 0.02, expectedStart: 2.25, expectedRelease: 2.75 },
  ]) test(`${row.name}, pitch ${String(midiPitch)}`, async () => {
    const { engine } = await ready();
    const result = engine.attackAudioVoices({ ...request(row.start, row.release, midiPitch), lateStartMarginSeconds: row.margin });
    if (!result.ok) throw new Error(result.refusal.code);
    expect(result.value.snapshot.activeVoices).toHaveLength(1);
    expect(result.value.snapshot.activeVoices[0]).toMatchObject({ midiPitch,
      attackTimeSeconds: row.expectedStart, naturalReleaseTimeSeconds: row.expectedRelease });
  });

  for (const row of [
    { name: "strict absolute past", start: 1, release: 1.5, margin: undefined, code: "audio.start_time_invalid" },
    { name: "negative absolute start", start: -1, release: -0.5, margin: 0.01, code: "audio.start_time_invalid" },
    { name: "nonfinite absolute start", start: NaN, release: 2.5, margin: 0.01, code: "audio.start_time_invalid" },
    { name: "future beyond horizon", start: 2.250001, release: 2.750001, margin: 0.01, code: "audio.start_time_invalid" },
    { name: "negative margin", start: 2.1, release: 2.6, margin: -0.001, code: "audio.start_time_invalid" },
    { name: "margin above bound", start: 2.1, release: 2.6, margin: 0.020001, code: "audio.start_time_invalid" },
    { name: "nonfinite margin", start: 2.1, release: 2.6, margin: Infinity, code: "audio.start_time_invalid" },
    { name: "NaN margin", start: 2.1, release: 2.6, margin: NaN, code: "audio.start_time_invalid" },
    { name: "string margin", start: 2.1, release: 2.6, margin: "0.01", code: "audio.start_time_invalid" },
    { name: "null margin", start: 2.1, release: 2.6, margin: null, code: "audio.start_time_invalid" },
    { name: "zero original gate", start: 1, release: 1, margin: 0.01, code: "audio.release_time_invalid" },
    { name: "oversized original gate", start: 1, release: 601.001, margin: 0.01, code: "audio.gate_duration_limit" },
  ] as const) test(`${row.name} refuses before any side effect`, async () => {
    const { engine, context } = await ready();
    const input = request(row.start, row.release);
    // Deliberate unknown-data boundary, not a type assertion admitting it.
    if (row.margin !== undefined) Reflect.set(input, "lateStartMarginSeconds", row.margin);
    const before = engine.inspectAudioEngine();
    const sourceIds = context.sourceIds();
    const result = engine.attackAudioVoices(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.code).toBe(row.code);
    const after = engine.inspectAudioEngine();
    expect(after.activeVoices).toEqual(before.activeVoices);
    expect(after.registryIndexCounts).toEqual(before.registryIndexCounts);
    expect(after.mix).toEqual(before.mix);
    expect(after.persistentCreatedNodeCount).toBe(before.persistentCreatedNodeCount);
    expect(context.sourceIds()).toEqual(sourceIds);
  });

  test("Stop cancels a caught-up future attack without replacing the graph", async () => {
    const { engine, context, fake } = await ready();
    const result = engine.attackAudioVoices({ ...request(1, 1.5), lateStartMarginSeconds: 0.01 });
    if (!result.ok) throw new Error(result.refusal.code);
    const retired = engine.retireAudioVoices({ selector: { kind: "all" }, reason: "all-notes-off", atTimeSeconds: 2 });
    if (!retired.ok) throw new Error(retired.refusal.code);
    expect(retired.value.noFutureAttackPostcondition).toBe(true);
    expect(fake.events.filter(e => e.kind === "source-stop" && e.atTimeSeconds !== null && e.atTimeSeconds <= 2.01)).toHaveLength(3);
    context.finishAllSources();
    expect(engine.inspectAudioEngine().retainedVoiceCount).toBe(0);
    expect(fake.contextCreationCount()).toBe(1);
  });
});

describe("X1 binds measured-browser catch-up at actual X0 admission", () => {
  for (const mode of ["progression", "count-in", "preview"] as const) test(mode, async () => {
    const fake = createFakeAudioPlatform();
    const engine = createAudioEngine(fake.platform);
    const timer = createFakeTransportTimer();
    let clock = 0;
    const attempts: { request: AudioAttackBatchRequest; result: AudioEngineResult<AudioAttackReceipt> }[] = [];
    const transport = createTransportService({ engine: { ...engine, attackAudioVoices(input) {
      clock += 0.04;
      const context = fake.contexts[0];
      if (context === undefined) throw new Error("TEST_CONTEXT_MISSING");
      context.setCurrentTime(clock);
      const result = engine.attackAudioVoices(input);
      attempts.push({ request: input, result });
      return result;
    } }, currentTimeSeconds: () => clock, timer: timer.port, publishNotification: () => {} });
    const plan = customPlan({ documentId: "late-attack-plan", tempoBpm: 120, durations: [{ numerator: 4, denominator: 1 }] });
    const init = initializePayload(plan);
    if (init.kind !== "initialize-transport") throw new Error("TEST_INIT_INVALID");
    requireReceipt(await transport.submitTransportCommand({ commandRequestId: 1,
      payload: { ...init, timing: { tickIntervalMs: 25, lookaheadSeconds: 0.1, immediateStartMarginSeconds: 0.01 } } }));
    const zero = makeBeatPosition({ numerator: 0, denominator: 1 });
    if (!zero.ok) throw new Error("TEST_ZERO_INVALID");
    const outcome = await transport.submitTransportCommand({ commandRequestId: 2, payload: mode === "preview"
      ? { kind: "start-preview", previewId: "x1:preview:late", instrumentId: "mellow-keys", midiPitches: [pitch(60)], gateSeconds: 0.5 }
      : { kind: "play", binding: planBinding(plan, 1), startBeat: zero.value, countIn: mode === "count-in" } });
    requireReceipt(outcome);
    expect(attempts.length).toBeGreaterThan(0);
    for (const attempt of attempts) {
      if (!attempt.result.ok) throw new Error(attempt.result.refusal.code);
      const voice = attempt.result.value.snapshot.activeVoices.find(v => v.eventId === attempt.request.eventId);
      expect(voice).toBeDefined();
      expect(voice?.attackTimeSeconds).toBeGreaterThan(attempt.request.startTimeSeconds);
      expect((voice?.naturalReleaseTimeSeconds ?? NaN) - (voice?.attackTimeSeconds ?? NaN))
        .toBeCloseTo(attempt.request.releaseTimeSeconds - attempt.request.startTimeSeconds, 12);
    }
    expect(transport.inspectTransport().state).toBe(mode === "preview" ? "ready" : "playing");
    requireReceipt(await transport.submitTransportCommand({ commandRequestId: 3, payload: { kind: "stop" } }));
    expect(transport.inspectTransport().state).toBe("ready");
    expect(engine.inspectAudioEngine().nonreleasingVoiceCount).toBe(0);
  });
});
