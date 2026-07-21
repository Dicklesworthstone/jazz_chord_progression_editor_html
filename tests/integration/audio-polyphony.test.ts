import { describe, expect, test } from "bun:test";

import {
  AUDIO_STEAL_ELIGIBILITY_POLICY,
  AUDIO_STEAL_ORDER,
} from "../../src/audio";
import {
  attackInBatches,
  attackRequest,
  previewOwner,
  progressionOwner,
  readyEngine,
  requireSuccess,
  voice,
  voices,
} from "../support/audio-engine-test-kit";

const POLYPHONY_CASE_IDS = [
  "X0-REG-025",
  "X0-REG-026",
  "X0-REG-027",
  "X0-REG-028",
  "X0-REG-029",
  "X0-REG-030",
  "X0-REG-031",
  "X0-REG-032",
] as const;

describe("TR-X0-POLYPHONY audio polyphony", () => {
  test("X0-REG-025/X0-REG-026 enforces progression and preview caps before creation", async () => {
    const progression = await readyEngine();
    attackInBatches(progression.engine, voices(48, "p-cap"), {
      owner: progressionOwner(1),
      eventPrefix: "p-cap",
    });
    const progressionReceipt = requireSuccess(
      progression.engine.attackAudioVoices(
        attackRequest([voice("p-new", 90)], { eventId: "p-new-event" }),
      ),
    );
    expect(progressionReceipt.stolenVoiceIds).toEqual(["p-cap-000"]);
    expect(progressionReceipt.snapshot.retainedVoiceCount).toBe(49);
    expect(progressionReceipt.snapshot.progressionNonreleasingVoiceCount).toBe(48);
    expect(progressionReceipt.snapshot.releasingVoiceCount).toBe(1);

    const preview = await readyEngine();
    attackInBatches(preview.engine, voices(20, "p-background"), {
      owner: progressionOwner(1),
      eventPrefix: "p-background",
    });
    const previewIdentity = previewOwner(3, "cap-preview");
    attackInBatches(preview.engine, voices(16, "v-cap", { midiStart: 72 }), {
      owner: previewIdentity,
      eventPrefix: "v-cap",
      instrumentId: "fm-electric-piano",
    });
    const previewReceipt = requireSuccess(
      preview.engine.attackAudioVoices(
        attackRequest([voice("v-new", 100)], {
          owner: previewIdentity,
          eventId: "v-new-event",
          instrumentId: "fm-electric-piano",
        }),
      ),
    );
    expect(previewReceipt.stolenVoiceIds).toEqual(["v-cap-000"]);
    expect(previewReceipt.snapshot.retainedVoiceCount).toBe(37);
    expect(previewReceipt.snapshot.previewNonreleasingVoiceCount).toBe(16);
    expect(previewReceipt.snapshot.progressionNonreleasingVoiceCount).toBe(20);
  });

  test("X0-REG-027/X0-REG-028 enforces recipe then global caps without selecting one victim twice", async () => {
    const recipe = await readyEngine();
    attackInBatches(recipe.engine, voices(16, "warm-a"), {
      owner: progressionOwner(1),
      eventPrefix: "warm-a",
      instrumentId: "warm-pad",
    });
    attackInBatches(recipe.engine, voices(16, "warm-b", { midiStart: 60 }), {
      owner: progressionOwner(2),
      eventPrefix: "warm-b",
      instrumentId: "warm-pad",
    });
    const recipeReceipt = requireSuccess(
      recipe.engine.attackAudioVoices(
        attackRequest([voice("warm-new", 100)], {
          owner: progressionOwner(2),
          eventId: "warm-new-event",
          instrumentId: "warm-pad",
        }),
      ),
    );
    expect(recipeReceipt.stolenVoiceIds).toEqual(["warm-b-000"]);
    expect(
      recipeReceipt.snapshot.activeVoices.filter(
        (entry) =>
          entry.instrumentId === "warm-pad" && entry.phase !== "releasing",
      ),
    ).toHaveLength(32);
    expect(recipeReceipt.snapshot.retainedVoiceCount).toBe(33);

    const global = await readyEngine();
    attackInBatches(global.engine, voices(48, "global-p"), {
      owner: progressionOwner(1),
      eventPrefix: "global-p",
      instrumentId: "mellow-keys",
    });
    attackInBatches(global.engine, voices(16, "global-v", { midiStart: 72 }), {
      owner: previewOwner(2, "global"),
      eventPrefix: "global-v",
      instrumentId: "analog-poly",
    });
    const globalReceipt = requireSuccess(
      global.engine.attackAudioVoices(
        attackRequest([voice("global-new", 110)], {
          owner: progressionOwner(1),
          eventId: "global-new-event",
          instrumentId: "vibraphone",
        }),
      ),
    );
    expect(globalReceipt.stolenVoiceIds).toEqual(["global-p-000"]);
    expect(new Set(globalReceipt.stolenVoiceIds).size).toBe(1);
    expect(globalReceipt.snapshot.nonreleasingVoiceCount).toBe(64);
    expect(globalReceipt.snapshot.retainedVoiceCount).toBe(65);
    expect(globalReceipt.snapshot.registryIndexCounts.totalReferences).toBe(390);
  });

  test("X0-REG-029 never reselects an owned releasing tail when a nonreleasing victim is required", async () => {
    expect(AUDIO_STEAL_ELIGIBILITY_POLICY).toBe(
      "nonreleasing-only-because-victim-must-reduce-admission-deficit",
    );
    const phase = await readyEngine();
    attackInBatches(phase.engine, voices(48, "eligibility"), {
      owner: progressionOwner(1),
      eventPrefix: "eligibility",
    });
    const existingTail = requireSuccess(
      phase.engine.retireAudioVoices({
        selector: { kind: "voice-ids", voiceIds: ["eligibility-000"] },
        reason: "generation-retire",
        atTimeSeconds: 0,
      }),
    );
    expect(existingTail.snapshot).toMatchObject({
      retainedVoiceCount: 48,
      nonreleasingVoiceCount: 47,
      releasingVoiceCount: 1,
    });

    const refilled = requireSuccess(
      phase.engine.attackAudioVoices(
        attackRequest([voice("eligibility-refill", 100)], {
          eventId: "eligibility-refill-event",
        }),
      ),
    );
    expect(refilled.stolenVoiceIds).toEqual([]);
    expect(refilled.snapshot).toMatchObject({
      retainedVoiceCount: 49,
      nonreleasingVoiceCount: 48,
      releasingVoiceCount: 1,
    });

    const incoming = requireSuccess(
      phase.engine.attackAudioVoices(
        attackRequest([voice("eligibility-incoming", 101)], {
          eventId: "eligibility-incoming-event",
        }),
      ),
    );
    expect(incoming.stolenVoiceIds).toEqual(["eligibility-001"]);
    expect(incoming.stolenVoiceIds).not.toContain("eligibility-000");
    expect(incoming.snapshot).toMatchObject({
      retainedVoiceCount: 50,
      nonreleasingVoiceCount: 48,
      releasingVoiceCount: 2,
      registryIndexCounts: { totalReferences: 300 },
    });
    expect(
      incoming.snapshot.activeVoices.find(
        (entry) => entry.voiceId === "eligibility-000",
      )?.phase,
    ).toBe("releasing");
    expect(
      incoming.snapshot.debugEvents.some(
        (event) =>
          event.kind === "voice-steal" &&
          event.voiceId === "eligibility-000",
      ),
    ).toBe(false);
  });

  test("X0-REG-030 prefers a same-owner nonreleasing victim before other owners", async () => {
    expect(AUDIO_STEAL_ORDER[0]).toBe(
      "same-incoming-owner-before-other-owner",
    );
    const owner = await readyEngine();
    attackInBatches(owner.engine, voices(47, "other-owner"), {
      owner: progressionOwner(1),
      eventPrefix: "other-owner",
    });
    requireSuccess(
      owner.engine.attackAudioVoices(
        attackRequest([voice("same-owner-z", 100)], {
          owner: progressionOwner(2),
          eventId: "same-owner-old",
        }),
      ),
    );
    const ownerReceipt = requireSuccess(
      owner.engine.attackAudioVoices(
        attackRequest([voice("same-owner-new", 101)], {
          owner: progressionOwner(2),
          eventId: "same-owner-new-event",
        }),
      ),
    );
    expect(ownerReceipt.stolenVoiceIds).toEqual(["same-owner-z"]);
  });

  test("X0-REG-031/X0-REG-032 orders by estimated gain, attack time, then voice ID", async () => {
    const gain = await readyEngine();
    const gainVoices = [
      voice("quiet-z", 60, 1),
      voice("loud-a", 61, 127),
      ...voices(46, "gain-filler", { midiStart: 62, velocity: 127 }),
    ];
    attackInBatches(gain.engine, gainVoices, {
      owner: progressionOwner(1),
      eventPrefix: "gain",
    });
    gain.context.setCurrentTime(0.2);
    const gainReceipt = requireSuccess(
      gain.engine.attackAudioVoices(
        attackRequest([voice("gain-new", 110, 127)], {
          eventId: "gain-new-event",
          startTimeSeconds: 0.2,
          releaseTimeSeconds: 1.2,
        }),
      ),
    );
    expect(gainReceipt.stolenVoiceIds).toEqual(["quiet-z"]);

    const age = await readyEngine();
    const oldBatch = [
      voice("old-z", 60, 100),
      voice("old-a", 61, 100),
      ...voices(14, "zz-old-filler", { midiStart: 62, velocity: 100 }),
    ];
    requireSuccess(
      age.engine.attackAudioVoices(
        attackRequest(oldBatch, {
          eventId: "old-batch",
          startTimeSeconds: 0,
          releaseTimeSeconds: 2,
        }),
      ),
    );
    attackInBatches(age.engine, voices(32, "newer-filler", { velocity: 100 }), {
      owner: progressionOwner(1),
      eventPrefix: "newer",
      startTimeSeconds: 0.1,
      releaseTimeSeconds: 2,
    });
    age.context.setCurrentTime(0.2);
    const ageReceipt = requireSuccess(
      age.engine.attackAudioVoices(
        attackRequest([voice("incoming-a", 110), voice("incoming-b", 111)], {
          eventId: "incoming-batch",
          startTimeSeconds: 0.2,
          releaseTimeSeconds: 1.2,
        }),
      ),
    );
    expect(ageReceipt.stolenVoiceIds).toEqual(["old-a", "old-z"]);
    expect(POLYPHONY_CASE_IDS).toHaveLength(8);
  });
});
