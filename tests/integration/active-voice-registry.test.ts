import { describe, expect, test } from "bun:test";

import {
  attackInBatches,
  attackRequest,
  midi,
  previewOwner,
  progressionOwner,
  readyEngine,
  requireFailure,
  requireSuccess,
  voice,
  voices,
} from "../support/audio-engine-test-kit";

const REGISTRY_CASE_IDS = [
  "X0-REG-001",
  "X0-REG-002",
  "X0-REG-003",
  "X0-REG-004",
  "X0-REG-010",
  "X0-REG-011",
  "X0-REG-012",
  "X0-REG-013",
  "X0-REG-014",
  "X0-REG-015",
  "X0-REG-016",
  "X0-REG-017",
  "X0-REG-018",
] as const;

function expectUniformIndexCounts(
  counts: Readonly<Record<string, number>>,
  voicesExpected: number,
): void {
  expect(counts).toMatchObject({
    voice: voicesExpected,
    generation: voicesExpected,
    event: voicesExpected,
    pitch: voicesExpected,
    owner: voicesExpected,
    instrument: voicesExpected,
    totalReferences: voicesExpected * 6,
  });
}

describe("TR-X0-REGISTRY active voice registry", () => {
  test("X0-REG-001/X0-REG-002 writes all six indexes for one and sixteen voices", async () => {
    const one = await readyEngine();
    requireSuccess(
      one.engine.attackAudioVoices(
        attackRequest([voice("one")], { eventId: "one-event" }),
      ),
    );
    expectUniformIndexCounts(one.engine.inspectAudioEngine().registryIndexCounts, 1);

    const sixteen = await readyEngine();
    requireSuccess(
      sixteen.engine.attackAudioVoices(
        attackRequest(voices(16, "sixteen"), { eventId: "sixteen-event" }),
      ),
    );
    expectUniformIndexCounts(
      sixteen.engine.inspectAudioEngine().registryIndexCounts,
      16,
    );
  });

  test("X0-REG-003 refuses a repeated within-batch voice ID before nodes or index writes", async () => {
    const { engine, context } = await readyEngine();
    const nodesBefore = context.nodeIds();
    const sourcesBefore = context.sourceIds();

    requireFailure(
      engine.attackAudioVoices(
        attackRequest([voice("duplicate", 60), voice("duplicate", 64)]),
      ),
      "audio.voice_id_duplicate",
    );

    expect(context.nodeIds()).toEqual(nodesBefore);
    expect(context.sourceIds()).toEqual(sourcesBefore);
    expect(engine.inspectAudioEngine()).toMatchObject({
      retainedVoiceCount: 0,
      registryIndexCounts: { totalReferences: 0 },
    });
  });

  test("X0-REG-004 refuses an unrelated owner collision and preserves the existing six references", async () => {
    const { engine, context } = await readyEngine();
    const first = requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("shared", 60)], {
          owner: progressionOwner(1),
          eventId: "progression-event",
        }),
      ),
    );
    const original = first.snapshot.activeVoices[0];
    if (original === undefined) {
      throw new Error("TEST_ORIGINAL_ACTIVE_VOICE_MISSING");
    }
    const nodesBefore = context.nodeIds();

    requireFailure(
      engine.attackAudioVoices(
        attackRequest([voice("shared", 60)], {
          owner: previewOwner(1, "collision-preview"),
          eventId: "preview-event",
        }),
      ),
      "audio.voice_id_duplicate",
    );

    const after = engine.inspectAudioEngine();
    expect(context.nodeIds()).toEqual(nodesBefore);
    expect(after.activeVoices).toEqual([original]);
    expectUniformIndexCounts(after.registryIndexCounts, 1);
  });

  test("X0-REG-010 snapshots identities in voice ID order, not insertion order", async () => {
    const { engine } = await readyEngine();
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest(
          [voice("zeta", 60), voice("alpha", 62), voice("middle", 64)],
          { eventId: "ordering-event" },
        ),
      ),
    );
    expect(
      engine.inspectAudioEngine().activeVoices.map((entry) => entry.voiceId),
    ).toEqual(["alpha", "middle", "zeta"]);
    expectUniformIndexCounts(engine.inspectAudioEngine().registryIndexCounts, 3);
  });

  test("X0-REG-011/X0-REG-012 event and pitch selectors retain exact owner scope", async () => {
    const eventHarness = await readyEngine();
    requireSuccess(
      eventHarness.engine.attackAudioVoices(
        attackRequest([voice("e1-a", 60), voice("e1-b", 62)], {
          eventId: "e1",
        }),
      ),
    );
    requireSuccess(
      eventHarness.engine.attackAudioVoices(
        attackRequest([voice("e2", 64)], { eventId: "e2" }),
      ),
    );
    const byEvent = requireSuccess(
      eventHarness.engine.retireAudioVoices({
        selector: { kind: "event", owner: progressionOwner(), eventId: "e1" },
        reason: "generation-retire",
        atTimeSeconds: 0,
      }),
    );
    expect(byEvent.newlyRetiredVoiceIds).toEqual(["e1-a", "e1-b"]);
    expect(
      byEvent.snapshot.activeVoices.find((entry) => entry.voiceId === "e2")?.phase,
    ).not.toBe("releasing");

    const pitchHarness = await readyEngine();
    requireSuccess(
      pitchHarness.engine.attackAudioVoices(
        attackRequest([voice("pitch-e1", 60), voice("pitch-64", 64)], {
          eventId: "pitch-e1",
        }),
      ),
    );
    requireSuccess(
      pitchHarness.engine.attackAudioVoices(
        attackRequest([voice("pitch-e2", 60)], { eventId: "pitch-e2" }),
      ),
    );
    const byPitch = requireSuccess(
      pitchHarness.engine.retireAudioVoices({
        selector: {
          kind: "pitch",
          owner: progressionOwner(),
          midiPitch: midi(60),
        },
        reason: "generation-retire",
        atTimeSeconds: 0,
      }),
    );
    expect(byPitch.newlyRetiredVoiceIds).toEqual(["pitch-e1", "pitch-e2"]);
    expect(
      byPitch.snapshot.activeVoices.find((entry) => entry.voiceId === "pitch-64")
        ?.phase,
    ).not.toBe("releasing");
  });

  test("X0-REG-013/X0-REG-014 separates owner kind while selecting generation", async () => {
    const progressionHarness = await readyEngine();
    requireSuccess(
      progressionHarness.engine.attackAudioVoices(
        attackRequest([voice("progression-4")], {
          owner: progressionOwner(4),
          eventId: "p4-event",
        }),
      ),
    );
    requireSuccess(
      progressionHarness.engine.attackAudioVoices(
        attackRequest([voice("progression-5")], {
          owner: progressionOwner(5),
          eventId: "p5-event",
        }),
      ),
    );
    requireSuccess(
      progressionHarness.engine.attackAudioVoices(
        attackRequest([voice("preview-4")], {
          owner: previewOwner(4, "generation-case"),
          eventId: "v4-event",
        }),
      ),
    );
    const progressionOnly = requireSuccess(
      progressionHarness.engine.retireAudioVoices({
        selector: { kind: "generation", ownerKind: "progression", generation: 4 },
        reason: "generation-retire",
        atTimeSeconds: 0,
      }),
    );
    expect(progressionOnly.newlyRetiredVoiceIds).toEqual(["progression-4"]);

    const previewHarness = await readyEngine();
    requireSuccess(
      previewHarness.engine.attackAudioVoices(
        attackRequest([voice("preview-g4")], {
          owner: previewOwner(4, "a"),
          eventId: "preview-g4-event",
        }),
      ),
    );
    requireSuccess(
      previewHarness.engine.attackAudioVoices(
        attackRequest([voice("preview-g5")], {
          owner: previewOwner(5, "b"),
          eventId: "preview-g5-event",
        }),
      ),
    );
    requireSuccess(
      previewHarness.engine.attackAudioVoices(
        attackRequest([voice("progression-g4")], {
          owner: progressionOwner(4),
          eventId: "progression-g4-event",
        }),
      ),
    );
    const previewOnly = requireSuccess(
      previewHarness.engine.retireAudioVoices({
        selector: { kind: "generation", ownerKind: "preview", generation: 4 },
        reason: "generation-retire",
        atTimeSeconds: 0,
      }),
    );
    expect(previewOnly.newlyRetiredVoiceIds).toEqual(["preview-g4"]);
  });

  test("X0-REG-015/X0-REG-016 separates exact preview and exact owner identities", async () => {
    const { engine } = await readyEngine();
    const p1 = previewOwner(7, "p1");
    const p2 = previewOwner(7, "p2");
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("p1-voice")], { owner: p1, eventId: "p1-event" }),
      ),
    );
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("p2-voice")], { owner: p2, eventId: "p2-event" }),
      ),
    );
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("progression-voice")], {
          eventId: "progression-event",
        }),
      ),
    );
    const exactPreview = requireSuccess(
      engine.retireAudioVoices({
        selector: { kind: "preview", generation: 7, previewId: "p1" },
        reason: "preview-release",
        atTimeSeconds: 0,
      }),
    );
    expect(exactPreview.newlyRetiredVoiceIds).toEqual(["p1-voice"]);

    const exactOwner = requireSuccess(
      engine.retireAudioVoices({
        selector: { kind: "owner", owner: p2 },
        reason: "preview-release",
        atTimeSeconds: 0,
      }),
    );
    expect(exactOwner.newlyRetiredVoiceIds).toEqual(["p2-voice"]);
    expect(
      exactOwner.snapshot.activeVoices.find(
        (entry) => entry.voiceId === "progression-voice",
      )?.phase,
    ).not.toBe("releasing");
  });

  test("X0-REG-017 selects all 64 retained voices in deterministic identity order", async () => {
    const { engine } = await readyEngine();
    attackInBatches(engine, voices(48, "progression"), {
      owner: progressionOwner(11),
      eventPrefix: "progression",
      instrumentId: "mellow-keys",
    });
    attackInBatches(engine, voices(16, "preview", { midiStart: 72 }), {
      owner: previewOwner(12, "all-case"),
      eventPrefix: "preview",
      instrumentId: "fm-electric-piano",
    });
    const before = engine.inspectAudioEngine();
    expect(before.nonreleasingVoiceCount).toBe(64);
    expectUniformIndexCounts(before.registryIndexCounts, 64);

    const retired = requireSuccess(
      engine.retireAudioVoices({
        selector: { kind: "all" },
        reason: "all-notes-off",
        atTimeSeconds: 0,
      }),
    );
    expect(retired.newlyRetiredVoiceIds).toHaveLength(64);
    expect(retired.newlyRetiredVoiceIds).toEqual(
      [...retired.newlyRetiredVoiceIds].sort(),
    );
    expect(retired.snapshot.releasingVoiceCount).toBe(64);
    expectUniformIndexCounts(retired.snapshot.registryIndexCounts, 64);
    expect(REGISTRY_CASE_IDS).toHaveLength(13);
  });

  test("X0-REG-018 retires an unknown voice ID as an empty idempotent selection", async () => {
    const { engine } = await readyEngine();
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("alpha", 60)], { eventId: "alpha-event" }),
      ),
    );
    const before = engine.inspectAudioEngine();

    const receipt = requireSuccess(
      engine.retireAudioVoices({
        selector: { kind: "voice-ids", voiceIds: ["missing"] },
        reason: "all-notes-off",
        atTimeSeconds: 0,
      }),
    );

    expect(receipt).toMatchObject({
      matchedVoiceIds: [],
      newlyRetiredVoiceIds: [],
      alreadyRetiringVoiceIds: [],
      noFutureAttackPostcondition: true,
    });
    expect(receipt.snapshot.activeVoices).toEqual(before.activeVoices);
    expectUniformIndexCounts(receipt.snapshot.registryIndexCounts, 1);
  });
});
