/**
 * E1-TRACE-LOSSES evidence.
 *
 * Enharmonic spellings, absent chord annotations, and unrepresentable loop
 * ranges are reported as explicit losses with the exact fixture wording,
 * in the frozen loss-kind order, and are never silently dropped. Expected
 * values come only from the reviewed fixtures.
 */
import { describe, expect, test } from "bun:test";

import { exportMidi } from "../../src/export";
import {
  applyE1Override,
  compactRequestForCase,
  goldenRequest,
  materializeE1Request,
  parseSmfBytes,
  requireExported,
  requireGoldenCase,
} from "../support/midi-export-test-kit";

describe("E1 loss reporting", () => {
  test("E1-GLD-003: events without a chord marker report one annotation-text loss", async () => {
    const fixtureCase = await requireGoldenCase("E1-GLD-003");
    const value = requireExported(exportMidi(await goldenRequest("E1-GLD-003")));
    expect(value.report.losses).toEqual(
      fixtureCase.expectedReport["losses"] as typeof value.report.losses,
    );
    expect(value.report.losses[0]?.kind).toBe("annotation-text");
    expect(value.report.losses[0]?.eventIds as readonly string[]).toEqual([
      "event-0000",
      "event-0001",
    ]);
  });

  test("E1-GLD-005: an altered spelling reports an enharmonic-spelling loss", async () => {
    const fixtureCase = await requireGoldenCase("E1-GLD-005");
    const value = requireExported(exportMidi(await goldenRequest("E1-GLD-005")));
    expect(value.report.losses).toEqual(
      fixtureCase.expectedReport["losses"] as typeof value.report.losses,
    );
    expect(value.report.losses[0]?.detail).toBe(
      "MIDI note numbers cannot encode these spellings; canonical symbols remain in markers and JSON",
    );
  });

  test("E1-GLD-006: a loop plan reports annotation and loop-range losses in kind order", async () => {
    const fixtureCase = await requireGoldenCase("E1-GLD-006");
    const value = requireExported(exportMidi(await goldenRequest("E1-GLD-006")));
    expect(value.report.losses).toEqual(
      fixtureCase.expectedReport["losses"] as typeof value.report.losses,
    );
    expect(value.report.losses.map((loss) => loss.kind)).toEqual([
      "annotation-text",
      "loop-range",
    ]);
    expect(value.report.losses[1]?.detail).toBe(
      "SMF format 1 has no loop chunk; the plan loop is reported, not encoded",
    );
  });

  test("fully annotated natural-spelling charts report no losses", async () => {
    const first = requireExported(exportMidi(await goldenRequest("E1-GLD-001")));
    expect(first.report.losses).toEqual([]);
    const second = requireExported(
      exportMidi(await goldenRequest("E1-GLD-002")),
    );
    expect(second.report.losses).toEqual([]);
  });

  test("loss entries and their event lists are frozen", async () => {
    const value = requireExported(exportMidi(await goldenRequest("E1-GLD-006")));
    for (const loss of value.report.losses) {
      expect(Object.isFrozen(loss)).toBe(true);
      expect(Object.isFrozen(loss.eventIds)).toBe(true);
    }
  });

  /*
   * E1 additive amendment (jcpe-u0mc): a note number doubled inside one
   * event — legal in a Manual voicing — no longer refuses midi.plan_invalid
   * (that law's premise, "P0 plans are duplicate-free by construction", was
   * falsified by the reviewed P0 corpus itself). It exports one on/off pair
   * for the doubled number and reports an explicit unison-doubling loss.
   */
  test("a doubled note number exports one on/off pair and reports unison-doubling", async () => {
    const base = await compactRequestForCase(
      await requireGoldenCase("E1-GLD-001"),
    );
    const doubled = applyE1Override(base, {
      path: "/plan/events/0/midiPitches/1",
      value: 60,
    });
    const value = requireExported(exportMidi(materializeE1Request(doubled)));

    const doubledEventId = value.report.losses.find(
      (loss) => loss.kind === "unison-doubling",
    );
    expect(doubledEventId?.eventIds.length).toBe(1);
    expect(doubledEventId?.detail).toBe(
      "a note number doubled inside one event sounds as one note-on/off pair; the stored voicing keeps the doubling",
    );

    const parsed = parseSmfBytes(value.bytes);
    const voicingTrack = parsed.tracks[1] ?? [];
    const onsAt60 = voicingTrack.filter(
      (event) => event["kind"] === "on" && event["note"] === 60,
    );
    const offsAt60 = voicingTrack.filter(
      (event) => event["kind"] === "off" && event["note"] === 60,
    );
    expect(onsAt60.length).toBe(1);
    expect(offsAt60.length).toBe(1);
    expect(value.report.noteCount).toBe(
      voicingTrack.filter((event) => event["kind"] === "on").length,
    );
  });

  test("near-miss: the same note number in different events reports no unison-doubling", async () => {
    const value = requireExported(exportMidi(await goldenRequest("E1-GLD-001")));
    expect(
      value.report.losses.some((loss) => loss.kind === "unison-doubling"),
    ).toBe(false);
  });
});
