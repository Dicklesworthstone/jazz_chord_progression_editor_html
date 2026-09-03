import { expect, test } from "bun:test";

import {
  MIDI_EXPORT_REQUEST_SCHEMA,
  MIDI_EXPORT_WRITER_ID,
  MIDI_EXPORT_WRITER_VERSION,
  exportMidi,
  type MidiExportRequest,
} from "../../src/export";
import {
  compilePlaybackPlan,
  type PlaybackPlan,
} from "../../src/playback";
import { parseSmfBytes } from "../support/midi-export-test-kit";
import {
  canonicalP0Json,
  observeP0Case,
  p0FixtureCase,
  requireP0Record,
} from "../support/p0-conformance";
import {
  materializeP0LoopCase,
  materializeP0TimelineCase,
} from "../support/p0-playback-fixtures";

function midiRequestFor(plan: PlaybackPlan): MidiExportRequest {
  return {
    schema: MIDI_EXPORT_REQUEST_SCHEMA,
    requestId: "p0-law-012-midi-join",
    writerId: MIDI_EXPORT_WRITER_ID,
    writerVersion: MIDI_EXPORT_WRITER_VERSION,
    documentId: plan.sourceDocumentId,
    sourceRevision: 0,
    title: "P0 join",
    voicingTrackName: "Voicings",
    instrumentName: "Piano",
    markers: [],
    plan,
  };
}

type TestConsumer = Readonly<{
  consume: (plan: PlaybackPlan) => void;
  received: () => PlaybackPlan | null;
}>;

function captureConsumer(): TestConsumer {
  let captured: PlaybackPlan | null = null;
  return Object.freeze({
    consume(plan: PlaybackPlan): void {
      if (captured !== null) throw new Error("P0_CONSUMER_DUPLICATE_HANDOFF");
      captured = plan;
    },
    received(): PlaybackPlan | null {
      return captured;
    },
  });
}

test("P0-LAW-012 hands the same frozen plan object to Audio and MIDI consumers", () => {
  const result = compilePlaybackPlan(
    materializeP0TimelineCase("P0-TIME-001").request,
  );
  if (!result.ok) throw new Error(`P0_LAW_012:${result.refusal.code}`);
  const before = canonicalP0Json(result.plan);
  const audio = captureConsumer();
  const midi = captureConsumer();

  audio.consume(result.plan);
  midi.consume(result.plan);
  const audioPlan = audio.received();
  const midiPlan = midi.received();

  expect(audioPlan).toBe(result.plan);
  expect(midiPlan).toBe(result.plan);
  expect(audioPlan).toBe(midiPlan);
  expect(Object.isFrozen(result.plan)).toBe(true);
  expect(Object.isFrozen(result.plan.events)).toBe(true);
  expect(canonicalP0Json(result.plan)).toBe(before);

  const manual = result.plan.events.find(
    ({ eventId }) => eventId === "event-p0-a1-2",
  );
  if (manual === undefined) throw new Error("P0_LAW_012_MANUAL_MISSING");
  expect(audioPlan?.events[1]?.pitches).toBe(manual.pitches);
  expect(midiPlan?.events[1]?.midiPitches).toBe(manual.midiPitches);
  expect(audioPlan?.events[1]?.midiPitches.map(Number)).toEqual([
    71, 64, 67, 60, 64,
  ]);
  expect(midiPlan?.events[1]?.midiPitches.map(Number)).toEqual([
    71, 64, 67, 60, 64,
  ]);
  expect(audioPlan?.events.map(({ startTick }) => startTick)).toEqual(
    midiPlan?.events.map(({ startTick }) => startTick),
  );
});

test("P0-LAW-012 kills a rebuilt MIDI plan that normalizes Manual order", () => {
  const result = compilePlaybackPlan(
    materializeP0TimelineCase("P0-TIME-001").request,
  );
  if (!result.ok) throw new Error("P0_LAW_012_NEAR_MISS_REFUSAL");
  const nearMissPlan = Object.freeze({
    ...result.plan,
    events: Object.freeze(result.plan.events.map((event) =>
      event.eventId === "event-p0-a1-2"
        ? Object.freeze({
            ...event,
            midiPitches: Object.freeze(
              [...event.midiPitches].sort((left, right) => left - right),
            ),
          })
        : event
    )),
  });
  const law = p0FixtureCase("P0-LAW-012").row;
  const nearMiss = requireP0Record(law["nearMiss"], "P0-LAW-012.nearMiss");

  expect(nearMiss["wrongBehavior"]).toBe(
    "MIDI sorts manual midiPitches ascending",
  );
  expect(nearMissPlan).not.toBe(result.plan);
  expect(canonicalP0Json(nearMissPlan)).not.toBe(
    canonicalP0Json(result.plan),
  );
});

test("P0-LAW-012 literal law observation is digest-equal to its fixture", () => {
  const observation = observeP0Case("P0-LAW-012");
  expect(observation.actualProjectionSha256).toBe(
    observation.expectedProjectionSha256,
  );
});

test("the real MIDI consumer exports a production loop plan and reports the loop loss", () => {
  const result = compilePlaybackPlan(materializeP0LoopCase("P0-LOOP-006").request);
  if (!result.ok) throw new Error(`P0_E1_JOIN:${result.refusal.code}`);
  const before = canonicalP0Json(result.plan);

  const exported = exportMidi(midiRequestFor(result.plan));
  if (!exported.ok) throw new Error(`P0_E1_JOIN:${exported.refusal.code}`);

  expect(canonicalP0Json(result.plan)).toBe(before);
  const parsed = parseSmfBytes(exported.value.bytes);
  expect(parsed.format).toBe(1);
  expect(parsed.division).toBe(960);
  const track1 = parsed.tracks[1] ?? [];
  const firstOn = track1.find((event) => event["kind"] === "on");
  expect(firstOn?.["tick"]).toBe(result.plan.events[0]?.startTick);
  expect(exported.value.report.totalTicks).toBe(result.plan.totalTicks);
  expect(exported.value.report.noteCount).toBe(
    result.plan.events.reduce(
      (sum, event) => sum + event.midiPitches.length,
      0,
    ),
  );
  expect(
    exported.value.report.losses.map((loss) => loss.kind),
  ).toContain("loop-range");
  expect(exported.value.report.filename).toBe("changes-doc-p0-loop.mid");
});

test("the production Manual unison plan exports with an explicit unison-doubling loss (jcpe-u0mc)", () => {
  /*
   * E1 additive amendment: the former duplicate-note refusal claimed "P0
   * plans are duplicate-free by construction", but this reviewed corpus
   * case ships a doubled unison (event-p0-a1-2, midiPitches
   * [71,64,67,60,64]). The chart must export — one on/off pair for the
   * doubled number, the loss named — because a legal chart that cannot
   * export MIDI at all is the real defect.
   */
  const result = compilePlaybackPlan(
    materializeP0TimelineCase("P0-TIME-001").request,
  );
  if (!result.ok) throw new Error("P0_E1_JOIN_MANUAL_REFUSAL");
  const manual = result.plan.events.find(
    ({ eventId }) => eventId === "event-p0-a1-2",
  );
  expect(
    new Set(manual?.midiPitches).size,
  ).toBeLessThan(manual?.midiPitches.length ?? 0);

  const exported = exportMidi(midiRequestFor(result.plan));
  if (!exported.ok) throw new Error("P0_E1_JOIN_DUPLICATE_REFUSED");
  const doubling = exported.value.report.losses.find(
    (loss) => loss.kind === "unison-doubling",
  );
  if (manual === undefined) throw new Error("P0_MANUAL_EVENT_NOT_FOUND");
  expect(doubling?.eventIds).toEqual([manual.eventId]);
  expect(exported.value.report.noteCount).toBe(
    result.plan.events.reduce(
      (sum, event) => sum + new Set(event.midiPitches).size,
      0,
    ),
  );
});
