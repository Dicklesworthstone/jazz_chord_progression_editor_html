/**
 * E1-TRACE-MARKERS evidence.
 *
 * Markers bind to plan events, sort by tick then section-before-chord then
 * bound-event ordinal, refuse unbound or duplicate bindings, and carry
 * their text verbatim as meta payload bytes. Expected values come only
 * from the reviewed fixtures.
 */
import { describe, expect, test } from "bun:test";

import { exportMidi } from "../../src/export";
import {
  goldenRequest,
  overriddenBaseRequest,
  parseSmfBytes,
  pathToPointer,
  requireExported,
  requireRefusal,
} from "../support/midi-export-test-kit";

type ParsedEvent = Record<string, unknown>;

function markers(track: readonly ParsedEvent[]): readonly ParsedEvent[] {
  return track.filter((event) => event["type"] === "marker");
}

describe("E1 marker ordering (E1-GLD-002)", () => {
  test("unsorted request markers emit sorted: tick, section before chord, ordinal", async () => {
    const value = requireExported(exportMidi(await goldenRequest("E1-GLD-002")));
    const track0 = parseSmfBytes(value.bytes).tracks[0] ?? [];
    expect(markers(track0)).toEqual([
      { tick: 0, type: "marker", text: "A" },
      { tick: 0, type: "marker", text: "Dm7" },
      { tick: 480, type: "marker", text: "Cmaj7" },
    ]);
  });

  test("the report counts markers from the request, not the sorted emission", async () => {
    const value = requireExported(exportMidi(await goldenRequest("E1-GLD-002")));
    expect(value.report.markerCount).toBe(3);
  });
});

describe("E1 marker text is verbatim (E1-GLD-001, E1-GLD-005)", () => {
  test("chord marker text lands unchanged in the conductor track", async () => {
    const value = requireExported(exportMidi(await goldenRequest("E1-GLD-001")));
    const track0 = parseSmfBytes(value.bytes).tracks[0] ?? [];
    expect(markers(track0)).toEqual([{ tick: 0, type: "marker", text: "Cmaj" }]);
  });

  test("a sharp sign survives byte-for-byte", async () => {
    const value = requireExported(exportMidi(await goldenRequest("E1-GLD-005")));
    const track0 = parseSmfBytes(value.bytes).tracks[0] ?? [];
    expect(markers(track0)).toEqual([{ tick: 0, type: "marker", text: "C#" }]);
  });
});

describe("E1 marker binding refusals (E1-REF-013, E1-REF-014)", () => {
  test("a marker naming a missing plan event refuses midi.marker_unbound", async () => {
    const refusal = requireRefusal(
      exportMidi(
        await overriddenBaseRequest({
          path: "/markers/0/eventId",
          value: "event-9999",
        }),
      ),
    );
    expect(refusal.code).toBe("midi.marker_unbound");
    expect(pathToPointer(refusal.path)).toBe("/markers/0/eventId");
  });

  test("a duplicate (kind, eventId) pair refuses midi.marker_duplicate", async () => {
    const refusal = requireRefusal(
      exportMidi(
        await overriddenBaseRequest({
          path: "/markers",
          value: "duplicate-first-marker",
        }),
      ),
    );
    expect(refusal.code).toBe("midi.marker_duplicate");
    expect(pathToPointer(refusal.path)).toBe("/markers/1");
  });
});
