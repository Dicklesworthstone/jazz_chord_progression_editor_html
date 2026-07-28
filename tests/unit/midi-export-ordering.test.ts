/**
 * E1-TRACE-ORDERING evidence.
 *
 * Inside each track: ascending ticks; at an equal tick meta events precede
 * channel events, note-offs precede note-ons, and equal kinds order by
 * ascending note number. Descending source event start ticks refuse.
 * Expected values come only from the reviewed fixtures.
 */
import { describe, expect, test } from "bun:test";

import { exportMidi } from "../../src/export";
import {
  goldenRequest,
  overriddenBaseRequest,
  parseSmfBytes,
  pathToPointer,
  requireExported,
  requireGoldenCase,
  requireRefusal,
} from "../support/midi-export-test-kit";

type ParsedEvent = Record<string, unknown>;

function channelEvents(track: readonly ParsedEvent[]): readonly ParsedEvent[] {
  return track.filter((event) => event["kind"] !== undefined);
}

describe("E1 equal-tick channel ordering (E1-GLD-003)", () => {
  test("at a shared tick every off precedes every on, both ascending by note", async () => {
    const value = requireExported(exportMidi(await goldenRequest("E1-GLD-003")));
    const track1 = parseSmfBytes(value.bytes).tracks[1] ?? [];
    const atBoundary = channelEvents(track1).filter(
      (event) => event["tick"] === 480,
    );
    expect(atBoundary).toEqual([
      { tick: 480, kind: "off", note: 60 },
      { tick: 480, kind: "off", note: 64 },
      { tick: 480, kind: "on", note: 60 },
      { tick: 480, kind: "on", note: 67 },
    ]);
  });

  test("the full voicing track matches the fixture model event for event", async () => {
    const fixtureCase = await requireGoldenCase("E1-GLD-003");
    const value = requireExported(exportMidi(await goldenRequest("E1-GLD-003")));
    const track1 = parseSmfBytes(value.bytes).tracks[1];
    expect(track1).toEqual(fixtureCase.expectedModel.track1);
  });
});

describe("E1 cross-event ordering (E1-GLD-002)", () => {
  test("ticks never decrease and equal-tick notes ascend by note number", async () => {
    const value = requireExported(exportMidi(await goldenRequest("E1-GLD-002")));
    const track1 = parseSmfBytes(value.bytes).tracks[1] ?? [];
    const notes = channelEvents(track1);
    for (let i = 1; i < notes.length; i += 1) {
      const previous = notes[i - 1];
      const current = notes[i];
      const previousTick = previous?.["tick"] as number;
      const currentTick = current?.["tick"] as number;
      expect(currentTick).toBeGreaterThanOrEqual(previousTick);
      if (
        previousTick === currentTick &&
        previous?.["kind"] === current?.["kind"]
      ) {
        expect(current?.["note"] as number).toBeGreaterThan(
          previous?.["note"] as number,
        );
      }
    }
  });
});

describe("E1 source order law (E1-REF-009)", () => {
  test("descending start ticks refuse midi.event_order_invalid", async () => {
    const refusal = requireRefusal(
      exportMidi(
        await overriddenBaseRequest({
          path: "/plan/events",
          value: "reorder-descending-start-ticks",
        }),
      ),
    );
    expect(refusal.code).toBe("midi.event_order_invalid");
    expect(pathToPointer(refusal.path)).toBe("/plan/events/1/startTick");
    expect(refusal.partialResult).toBe(false);
  });
});
