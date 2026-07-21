import { describe, expect, test } from "bun:test";

import {
  attackRequest,
  previewOwner,
  readyEngine,
  requireSuccess,
  voice,
} from "../support/audio-engine-test-kit";

const RETRIGGER_CASE_IDS = [
  "X0-REG-005",
  "X0-REG-006",
  "X0-REG-007",
  "X0-REG-008",
  "X0-REG-009",
] as const;

describe("TR-X0-RETRIGGER audio retrigger ordering", () => {
  test("X0-REG-005/X0-REG-006 retires the exact old instance before starting its replacement", async () => {
    const { engine, fake, context } = await readyEngine();
    context.setCurrentTime(4);
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("shared", 60)], {
          eventId: "event-e1",
          startTimeSeconds: 4,
          releaseTimeSeconds: 5,
        }),
      ),
    );
    const oldSourceIds = context.sourceIds();
    const eventOffset = fake.events.length;
    const replacement = requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("shared", 60)], {
          eventId: "event-e1",
          startTimeSeconds: 4,
          releaseTimeSeconds: 5,
        }),
      ),
    );

    expect(replacement.retriggeredVoiceIds).toEqual(["shared"]);
    expect(replacement.snapshot.retainedVoiceCount).toBe(2);
    expect(replacement.snapshot.releasingVoiceCount).toBe(1);
    expect(replacement.snapshot.registryIndexCounts.totalReferences).toBe(12);
    const operationEvents = fake.events.slice(eventOffset);
    const oldStops = operationEvents.filter(
      (event) =>
        event.kind === "source-stop" && oldSourceIds.includes(event.subject),
    );
    const newStarts = operationEvents.filter(
      (event) => event.kind === "source-start",
    );
    expect(oldStops).toHaveLength(3);
    expect(newStarts).toHaveLength(3);
    expect(Math.max(...oldStops.map((event) => event.sequence))).toBeLessThan(
      Math.min(...newStarts.map((event) => event.sequence)),
    );
    const relevantDebug = replacement.snapshot.debugEvents.filter(
      (event) =>
        event.kind === "voice-retrigger-retire" || event.kind === "voice-attack",
    );
    expect(relevantDebug.slice(-2).map((event) => event.kind)).toEqual([
      "voice-retrigger-retire",
      "voice-attack",
    ]);
  });

  test("X0-REG-007/X0-REG-008/X0-REG-009 leaves pitch, event, and owner near misses sounding", async () => {
    const { engine } = await readyEngine();
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("baseline", 60)], { eventId: "event-e1" }),
      ),
    );
    const differentPitch = requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("pitch-near-miss", 61)], { eventId: "event-e1" }),
      ),
    );
    const differentEvent = requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("event-near-miss", 60)], { eventId: "event-e2" }),
      ),
    );
    const differentOwner = requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("owner-near-miss", 60)], {
          owner: previewOwner(1, "near-miss"),
          eventId: "event-e1",
        }),
      ),
    );

    expect(differentPitch.retriggeredVoiceIds).toEqual([]);
    expect(differentEvent.retriggeredVoiceIds).toEqual([]);
    expect(differentOwner.retriggeredVoiceIds).toEqual([]);
    expect(differentOwner.snapshot.retainedVoiceCount).toBe(4);
    expect(differentOwner.snapshot.releasingVoiceCount).toBe(0);
    expect(differentOwner.snapshot.registryIndexCounts.totalReferences).toBe(24);
    expect(RETRIGGER_CASE_IDS).toHaveLength(5);
  });
});
