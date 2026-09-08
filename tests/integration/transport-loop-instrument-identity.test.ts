import { expect, test } from "bun:test";
import { makeBeatPosition } from "../../src/domain";
import { compileStudioPlaybackPlan, performStudioPlaybackRange, studioSectionLoopRange } from "../../src/application/studio-playback";
import { loopArrangementFixture } from "../support/loop-arrangement-fixture";
import { createTransportHarness, initializePayload, planBinding, requireReceipt } from "../support/transport-test-kit";

for (const instrument of ["analog-poly", "vibraphone"] as const) test(`a pending loop bass attack survives an instrument change to ${instrument}`, async () => {
  const document = loopArrangementFixture().state.document;
  const literal = compileStudioPlaybackPlan(document);
  if (!literal.ok) throw new Error(literal.refusal.message);
  const compiled = performStudioPlaybackRange(literal.plan, studioSectionLoopRange(document, "loop-section-1"), "bossa-nova@1");
  if (!compiled.ok) throw new Error(compiled.refusal.message);
  const plan = compiled.plan;
  const start = makeBeatPosition({ numerator: 4, denominator: 1 });
  if (!start.ok) throw new Error("Invalid fixture beat");
  const h = createTransportHarness();
  requireReceipt(await h.submit(initializePayload(plan)));
  requireReceipt(await h.submit({ kind: "set-instrument", instrumentId: "analog-poly" }));
  requireReceipt(await h.submit({ kind: "play", binding: planBinding(plan, 1), startBeat: start.value, countIn: false }));
  h.setClock(0.3); h.timer.fire();
  const prior = h.engine.inspectAudioEngine().debugEvents.filter(e => e.kind === "voice-attack" && e.eventId === "loop-event-1.b1");
  expect(prior).toHaveLength(1);
  expect(Number(prior[0]?.midiPitch)).toBe(33);
  expect(prior[0]?.scheduledTimeSeconds).toBe(0.375);
  h.setClock(0.31);
  requireReceipt(await h.submit({ kind: "set-instrument", instrumentId: instrument }));
  expect(h.service.inspectTransport().state).toBe("playing");
  const after = h.engine.inspectAudioEngine().debugEvents;
  const replacement = after.filter(e => e.kind === "voice-attack" && e.eventId === "loop-event-1.b1").at(-1);
  expect(replacement?.scheduledTimeSeconds).toBe(0.375);
  // Independent accepted window: vibes A1 (33) folds two octaves to A3
  // (57), while analog-poly keeps A1. The source plan stays unchanged.
  expect(Number(replacement?.midiPitch)).toBe(instrument === "vibraphone" ? 57 : 33);
  if (instrument === "vibraphone") expect(replacement?.voiceId).not.toBe(prior[0]?.voiceId);
  expect(plan.events.find(e => e.eventId === "loop-event-1.b1")?.midiPitches.map(Number)).toEqual([33]);
  expect(after.some(e => e.kind === "operation-refused")).toBe(false);
  // Return to the original recipe before this onset: no generation change
  // or sounding-note retirement is needed to reschedule the pending bass.
  h.setClock(0.32);
  requireReceipt(await h.submit({ kind: "set-instrument", instrumentId: "analog-poly" }));
  const restored = h.engine.inspectAudioEngine().debugEvents.filter(e => e.kind === "voice-attack" && e.eventId === "loop-event-1.b1").at(-1);
  expect(Number(restored?.midiPitch)).toBe(33); expect(restored?.scheduledTimeSeconds).toBe(0.375);
  const stopped = requireReceipt(await h.submit({ kind: "stop" }));
  expect(stopped.noFutureAttackPostcondition).toBe(true);
  requireReceipt(await h.submit({ kind: "dispose-transport", reason: "page-teardown" }));
}, 30_000);
