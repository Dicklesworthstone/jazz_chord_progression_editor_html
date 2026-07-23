import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  makeBeatPosition,
  makeMidiPitch,
  type BeatPosition,
  type MidiPitch,
} from "../../src/domain";
import {
  createTransportHarness,
  customPlan,
  initializePayload,
  planBinding,
  requireReceipt,
  requireRefusal,
} from "../support/transport-test-kit";

setDefaultTimeout(240_000);

const zeroBeat: BeatPosition = (() => {
  const made = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!made.ok) throw new Error("zero beat");
  return made.value;
})();

function pitch(value: number): MidiPitch {
  const made = makeMidiPitch(value);
  if (!made.ok) throw new Error("pitch");
  return made.value;
}

describe("TR-X1-PREVIEW preview channel isolation", () => {
  test("X1-CMD-013 preview envelopes are runtime-validated", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-preview-013",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    const invalidPayloads: readonly Readonly<Record<string, unknown>>[] = [
      { previewId: "preview-1", midiPitches: [60], gateSeconds: 0.5 },
      { previewId: "x1:preview:", midiPitches: [60], gateSeconds: 0.5 },
      { previewId: "x1:preview:a", midiPitches: [], gateSeconds: 0.5 },
      {
        previewId: "x1:preview:a",
        midiPitches: Array.from({ length: 17 }, () => 60),
        gateSeconds: 0.5,
      },
      { previewId: "x1:preview:a", midiPitches: [128], gateSeconds: 0.5 },
      { previewId: "x1:preview:a", midiPitches: [60], gateSeconds: 0.004 },
      { previewId: "x1:preview:a", midiPitches: [60], gateSeconds: 601 },
    ];
    for (const invalid of invalidPayloads) {
      const outcome = requireRefusal(
        await harness.service.submitTransportCommand({
          commandRequestId: harness.nextRequestId(),
          payload: {
            kind: "start-preview",
            instrumentId: "mellow-keys",
            ...invalid,
          } as never,
        }),
      );
      expect(outcome.code).toBe("transport.preview_invalid");
    }
    expect(
      harness.attacks.filter((attack) => attack.ownerKind === "preview"),
    ).toHaveLength(0);
  });

  test("X1-CMD-014 a new preview releases the previous preview before its first attack", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-preview-014",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    requireReceipt(
      await harness.submit({
        kind: "start-preview",
        previewId: "x1:preview:a",
        instrumentId: "mellow-keys",
        midiPitches: [pitch(60), pitch(64), pitch(67)],
        gateSeconds: 2,
      }),
    );
    const retirementsBefore = harness.retirements.length;
    const attacksBefore = harness.attacks.length;
    requireReceipt(
      await harness.submit({
        kind: "start-preview",
        previewId: "x1:preview:b",
        instrumentId: "vibraphone",
        midiPitches: [pitch(62)],
        gateSeconds: 2,
      }),
    );
    const release = harness.retirements[retirementsBefore];
    expect(release).toBeDefined();
    expect(release?.selectorKind).toBe("preview");
    expect(release?.reason).toBe("preview-release");
    const attack = harness.attacks[attacksBefore];
    expect(attack).toBeDefined();
    expect(attack?.ownerKind).toBe("preview");
    expect(attack?.eventId).toBe("x1:preview:b");
    expect(
      harness.service.inspectTransport().work.previewsReleased,
    ).toBe(1);
    expect(harness.service.inspectTransport().work.previewsStarted).toBe(2);
  });

  test("X1-CMD-015 releasing an unknown preview refuses without touching the engine", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-preview-015",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    const retirementsBefore = harness.retirements.length;
    const unknown = requireRefusal(
      await harness.submit({
        kind: "release-preview",
        previewId: "x1:preview:missing",
      }),
    );
    expect(unknown.code).toBe("transport.preview_invalid");
    expect(harness.retirements.length).toBe(retirementsBefore);
  });

  test("previews never change progression transport state, playhead, binding, or published status", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-preview-iso",
      tempoBpm: 120,
      durations: [
        { numerator: 4, denominator: 1 },
        { numerator: 4, denominator: 1 },
      ],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    const before = harness.service.inspectTransport();
    const notificationsBefore = harness.notifications.length;
    requireReceipt(
      await harness.submit({
        kind: "start-preview",
        previewId: "x1:preview:iso",
        instrumentId: "warm-pad",
        midiPitches: [pitch(48), pitch(55)],
        gateSeconds: 1,
      }),
    );
    requireReceipt(
      await harness.submit({
        kind: "release-preview",
        previewId: "x1:preview:iso",
      }),
    );
    const after = harness.service.inspectTransport();
    expect(after.state).toBe(before.state);
    expect(after.generation).toBe(before.generation);
    expect(after.planRevision).toBe(before.planRevision);
    expect(after.documentId).toBe(before.documentId);
    expect(after.scheduledEventCursor).toBe(before.scheduledEventCursor);
    expect(harness.notifications.length).toBe(notificationsBefore);
  });
});
