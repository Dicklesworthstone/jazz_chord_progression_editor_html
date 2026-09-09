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
  test("Stop from ready retires the active preview before claiming a safe stop", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({ documentId: "doc-preview-ready-stop", tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }] });
    requireReceipt(await harness.submit(initializePayload(plan)));
    requireReceipt(await harness.submit({ kind: "start-preview", previewId: "x1:preview:ready-stop",
      instrumentId: "mellow-keys", midiPitches: [pitch(60)], gateSeconds: 0.5 }));
    expect(harness.service.inspectTransport().state).toBe("ready");
    expect(harness.engine.inspectAudioEngine().previewNonreleasingVoiceCount).toBe(1);
    const generation = harness.service.inspectTransport().generation;
    const stopped = requireReceipt(await harness.submit({ kind: "stop" }));
    expect(stopped.noFutureAttackPostcondition).toBe(true);
    expect(harness.retirements.at(-1)?.selectorKind).toBe("all");
    expect(harness.engine.inspectAudioEngine().previewNonreleasingVoiceCount).toBe(0);
    expect(harness.service.inspectTransport().generation).toBe(generation + 1);
    expect(requireRefusal(await harness.submit({ kind: "release-preview", previewId: "x1:preview:ready-stop" })).code)
      .toBe("transport.preview_invalid");
    requireReceipt(await harness.submit({ kind: "stop" }));
    expect(harness.service.inspectTransport().generation).toBe(generation + 1);
    expect(harness.fake.contextCreationCount()).toBe(1);
  });

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


describe("M1 performed preview sequence", () => {
  test("audio-clock horizons preserve independent onset/gate/velocity facts and release cancels future notes", async () => {
    const h = createTransportHarness();
    const plan = customPlan({documentId:"audition-plan", tempoBpm:120,
      durations:[{numerator:1,denominator:1},{numerator:1,denominator:1},{numerator:1,denominator:1}]});
    requireReceipt(await h.submit(initializePayload(plan)));
    const before = h.service.inspectTransport();
    requireReceipt(await h.submit({kind:"start-preview",previewId:"x1:preview:sequence",instrumentId:"mellow-keys",
      midiPitches:[pitch(60)],gateSeconds:0.2,previewPlan:planBinding(plan)}));
    expect(h.attacks).toHaveLength(1);
    expect(h.attacks[0]?.startTimeSeconds).toBe(0);
    expect(h.attacks[0]?.releaseTimeSeconds).toBe(0.4875);
    expect(h.attacks[0]?.velocities).toEqual([96,96,96,96]);
    h.setClock(0.4); h.timer.fire();
    expect(h.attacks).toHaveLength(2);
    expect(h.attacks[1]?.startTimeSeconds).toBe(0.5);
    expect(h.service.inspectTransport().state).toBe(before.state);
    expect(h.service.inspectTransport().documentId).toBe(before.documentId);
    requireReceipt(await h.submit({kind:"release-preview",previewId:"x1:preview:sequence"}));
    h.setClock(1); h.timer.fire();
    expect(h.attacks).toHaveLength(2);
    expect(h.timer.activeHandleCount()).toBe(0);
    expect(h.engine.inspectAudioEngine().previewNonreleasingVoiceCount).toBe(0);
  });
});

test("performed preview refuses malformed or oversized immutable plans before replacing a sounding preview", async () => {
  const h=createTransportHarness();
  const plan=customPlan({documentId:"admission-plan",tempoBpm:120,durations:[{numerator:1,denominator:1}]});
  requireReceipt(await h.submit(initializePayload(plan)));
  requireReceipt(await h.submit({kind:"start-preview",previewId:"x1:preview:kept",instrumentId:"mellow-keys",midiPitches:[pitch(60)],gateSeconds:1}));
  const first=plan.events[0]; if(first===undefined) throw new Error("fixture");
  const invalidPlans:readonly unknown[]=[null,{},
    {...plan},
    Object.freeze({...plan,totalTicks:61441}),
    Object.freeze({...plan,events:Object.freeze([])}),
    Object.freeze({...plan,events:Object.freeze(Array.from({length:257},()=>first))}),
    ...[{velocity:0},{velocity:128},{gateDurationTicks:0},{gateDurationTicks:2000},{midiPitches:Object.freeze([128])}].map(patch=>
      Object.freeze({...plan,events:Object.freeze([Object.freeze({...first,...patch})])})),
  ];
  for(const bad of invalidPlans) {
    const refused=requireRefusal(await h.submit({kind:"start-preview",previewId:"x1:preview:bad",instrumentId:"mellow-keys",
      midiPitches:[pitch(60)],gateSeconds:1,previewPlan:{...planBinding(plan),plan:bad}} as never));
    expect(refused.code).toBe("transport.preview_invalid");
    expect(h.engine.inspectAudioEngine().previewNonreleasingVoiceCount).toBe(1);
    expect(h.attacks).toHaveLength(1);
  }
  requireReceipt(await h.submit({kind:"stop"}));
});

test("performed preview preserves velocity and transposition, completes and cannot replay on a stale timer", async () => {
  for(let transpose=0;transpose<12;transpose++) {
    const h=createTransportHarness();
    const original=customPlan({documentId:"complete-plan",tempoBpm:120,durations:[{numerator:1,denominator:1}]});
    const plan=Object.freeze({...original,events:Object.freeze(original.events.map(event=>Object.freeze({...event,
      midiPitches:Object.freeze(event.midiPitches.map(p=>pitch(p+transpose))),velocity:73})))}) as unknown as typeof original;
    requireReceipt(await h.submit(initializePayload(plan)));
    requireReceipt(await h.submit({kind:"start-preview",previewId:"x1:preview:complete",instrumentId:"mellow-keys",
      midiPitches:[pitch(60)],gateSeconds:1,previewPlan:planBinding(plan)}));
    expect(h.attacks[0]?.velocities).toEqual([73,73,73,73]);
    expect(h.attacks[0]?.midiPitches).toEqual([48,55,59,64].map(p=>p+transpose));
    expect(h.service.readPreviewStatus().status).toBe("running");
    h.setClock(4);h.timer.fire();
    expect(h.service.readPreviewStatus().status).toBe("completed");
    expect(h.timer.activeHandleCount()).toBe(0);
    h.timer.fire(3);expect(h.attacks).toHaveLength(1);
    requireReceipt(await h.submit({kind:"stop"}));
  }
});

test("releasing a performed preview preserves playing band voices and its binding", async () => {
  const h=createTransportHarness();
  const plan=customPlan({documentId:"band-plan",tempoBpm:120,durations:[{numerator:4,denominator:1}]});
  requireReceipt(await h.submit(initializePayload(plan)));
  requireReceipt(await h.submit({kind:"play",binding:planBinding(plan),startBeat:zeroBeat,countIn:false}));
  const before=h.service.inspectTransport();
  const count=h.engine.inspectAudioEngine().progressionNonreleasingVoiceCount;
  expect(count).toBeGreaterThan(0);
  requireReceipt(await h.submit({kind:"start-preview",previewId:"x1:preview:alongside",instrumentId:"mellow-keys",
    midiPitches:[pitch(60)],gateSeconds:1,previewPlan:planBinding(plan)}));
  requireReceipt(await h.submit({kind:"release-preview",previewId:"x1:preview:alongside"}));
  expect(h.service.inspectTransport().state).toBe("playing");
  expect(h.service.inspectTransport().generation).toBe(before.generation);
  expect(h.service.inspectTransport().planRevision).toBe(before.planRevision);
  expect(h.engine.inspectAudioEngine().progressionNonreleasingVoiceCount).toBe(count);
  requireReceipt(await h.submit({kind:"stop"}));
  expect(h.timer.activeHandleCount()).toBe(0);
});

test("preview interruption and disposal retire the timer and all future attacks", async () => {
  for(const ending of ["interrupt","dispose"] as const) {
    const h=createTransportHarness();
    const plan=customPlan({documentId:"ending-plan",tempoBpm:120,durations:[{numerator:1,denominator:1},{numerator:1,denominator:1}]});
    requireReceipt(await h.submit(initializePayload(plan)));
    requireReceipt(await h.submit({kind:"start-preview",previewId:"x1:preview:ending",instrumentId:"mellow-keys",
      midiPitches:[pitch(60)],gateSeconds:1,previewPlan:planBinding(plan)}));
    expect(h.attacks).toHaveLength(1);
    if(ending==="interrupt") {
      h.controller().setState("suspended");h.timer.fire();
      expect(h.service.readPreviewStatus().status).toBe("failed");
    } else requireReceipt(await h.submit({kind:"dispose-transport",reason:"page-teardown"}));
    expect(h.timer.activeHandleCount()).toBe(0);
    h.setClock(1);h.timer.fire(3);expect(h.attacks).toHaveLength(1);
  }
});

test("new single-note preview replaces the sequence and stale release cannot kill it", async () => {
  const h=createTransportHarness();
  const plan=customPlan({documentId:"replace-preview",tempoBpm:120,durations:[{numerator:1,denominator:1},{numerator:1,denominator:1}]});
  requireReceipt(await h.submit(initializePayload(plan)));
  requireReceipt(await h.submit({kind:"start-preview",previewId:"x1:preview:old",instrumentId:"mellow-keys",midiPitches:[pitch(60)],gateSeconds:1,previewPlan:planBinding(plan)}));
  requireReceipt(await h.submit({kind:"start-preview",previewId:"x1:preview:new",instrumentId:"mellow-keys",midiPitches:[pitch(72)],gateSeconds:1}));
  expect(requireRefusal(await h.submit({kind:"release-preview",previewId:"x1:preview:old"})).code).toBe("transport.preview_invalid");
  expect(h.engine.inspectAudioEngine().previewNonreleasingVoiceCount).toBe(1);
  expect(h.timer.activeHandleCount()).toBe(0);
  h.setClock(1);h.timer.fire();expect(h.attacks).toHaveLength(2);
  requireReceipt(await h.submit({kind:"stop"}));
});


test("reused preview IDs cannot revive callbacks captured before replacement", async () => {
  const h=createTransportHarness();
  const plan=customPlan({documentId:"reused-preview",tempoBpm:120,durations:[{numerator:1,denominator:1},{numerator:1,denominator:1}]});
  requireReceipt(await h.submit(initializePayload(plan)));
  const request={kind:"start-preview" as const,previewId:"x1:preview:reused",instrumentId:"mellow-keys" as const,
    midiPitches:[pitch(60)] as const,gateSeconds:1,previewPlan:planBinding(plan)};
  requireReceipt(await h.submit(request));
  const stale=h.timer.captureCallbacks();
  requireReceipt(await h.submit(request));
  const attacks=h.attacks.length;
  h.setClock(0.5);for(const callback of stale) callback();
  expect(h.attacks).toHaveLength(attacks);
  h.timer.fire();expect(h.attacks).toHaveLength(attacks+1);
  requireReceipt(await h.submit({kind:"stop"}));
});
