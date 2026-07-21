import { describe, expect, test } from "bun:test";

import {
  attackRequest,
  previewOwner,
  progressionOwner,
  readyEngine,
  requireSuccess,
  voice,
} from "../support/audio-engine-test-kit";

const OWNERSHIP_CASE_IDS = [
  "X0-ROUTE-006",
  "X0-ROUTE-007",
  "X0-ROUTE-008",
  "X0-REG-009",
  "X0-REG-014",
  "X0-REG-015",
  "X0-REG-016",
] as const;

describe("TR-X0-OWNERSHIP audio preview ownership", () => {
  test("X0-ROUTE-006/X0-ROUTE-007/X0-REG-009 routes section and preview near misses through one graph", async () => {
    const { engine, fake } = await readyEngine();
    const section = requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("section-note", 60)], {
          owner: progressionOwner(4),
          eventId: "shared-event",
          instrumentId: "warm-pad",
        }),
      ),
    );
    const preview = requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("preview-note", 60)], {
          owner: previewOwner(4, "preview-a"),
          eventId: "shared-event",
          instrumentId: "warm-pad",
        }),
      ),
    );

    expect(preview.retriggeredVoiceIds).toEqual([]);
    expect(preview.snapshot.retainedVoiceCount).toBe(2);
    expect(preview.snapshot.progressionNonreleasingVoiceCount).toBe(1);
    expect(preview.snapshot.previewNonreleasingVoiceCount).toBe(1);
    expect(preview.snapshot.graphInstanceId).toBe(section.snapshot.graphInstanceId);
    expect(preview.snapshot.persistentCreatedNodeCount).toBe(12);
    expect(preview.snapshot.persistentEdgeCount).toBe(13);
    expect(fake.contextCreationCount()).toBe(1);
  });

  test("X0-ROUTE-008/X0-REG-014/X0-REG-015/X0-REG-016 preview release cannot retire progression or another preview identity", async () => {
    const { engine } = await readyEngine();
    const p1 = previewOwner(7, "p1");
    const p2 = previewOwner(7, "p2");
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("progression")], {
          owner: progressionOwner(7),
          eventId: "progression-event",
        }),
      ),
    );
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("preview-p1")], { owner: p1, eventId: "p1-event" }),
      ),
    );
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("preview-p2")], { owner: p2, eventId: "p2-event" }),
      ),
    );
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("preview-generation-8")], {
          owner: previewOwner(8, "p3"),
          eventId: "p3-event",
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
    expect(exactPreview.newlyRetiredVoiceIds).toEqual(["preview-p1"]);
    expect(exactPreview.snapshot.progressionNonreleasingVoiceCount).toBe(1);

    const exactOwner = requireSuccess(
      engine.retireAudioVoices({
        selector: { kind: "owner", owner: p2 },
        reason: "preview-release",
        atTimeSeconds: 0,
      }),
    );
    expect(exactOwner.newlyRetiredVoiceIds).toEqual(["preview-p2"]);
    const generation = requireSuccess(
      engine.retireAudioVoices({
        selector: { kind: "generation", ownerKind: "preview", generation: 8 },
        reason: "generation-retire",
        atTimeSeconds: 0,
      }),
    );
    expect(generation.newlyRetiredVoiceIds).toEqual(["preview-generation-8"]);
    expect(
      generation.snapshot.activeVoices.find(
        (entry) => entry.voiceId === "progression",
      )?.phase,
    ).not.toBe("releasing");
    expect(generation.snapshot.graphInstanceId).toBe(1);
    expect(OWNERSHIP_CASE_IDS).toHaveLength(7);
  });
});
