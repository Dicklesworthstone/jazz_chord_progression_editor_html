/**
 * E1-TRACE-REPORT and E1-TRACE-FILENAME evidence.
 *
 * The report states writer pins, tempo encoding with its bounded rational
 * error, counts, byte length, total ticks, the deterministic filename, and
 * losses exactly. Expected values come only from the reviewed fixtures.
 */
import { describe, expect, test } from "bun:test";

import {
  MIDI_EXPORT_DIVISION,
  MIDI_EXPORT_FORMAT,
  MIDI_EXPORT_REPORT_SCHEMA,
  MIDI_EXPORT_TRACK_COUNT,
  MIDI_EXPORT_WRITER_ID,
  MIDI_EXPORT_WRITER_VERSION,
  exportMidi,
} from "../../src/export";
import {
  goldenRequest,
  loadGoldenFixture,
  requireExported,
  requireGoldenCase,
} from "../support/midi-export-test-kit";

const GOLDEN_IDS = [
  "E1-GLD-001",
  "E1-GLD-002",
  "E1-GLD-003",
  "E1-GLD-004",
  "E1-GLD-005",
  "E1-GLD-006",
] as const;

describe("E1 report exactness against every golden", () => {
  for (const caseId of GOLDEN_IDS) {
    test(`${caseId}: the report matches the fixture expectation field for field`, async () => {
      const fixtureCase = await requireGoldenCase(caseId);
      const value = requireExported(exportMidi(await goldenRequest(caseId)));
      const projected: Record<string, unknown> = {
        requestedBpm: value.report.requestedBpm,
        encodedMicrosecondsPerQuarter:
          value.report.encodedMicrosecondsPerQuarter,
        roundingErrorNumerator: value.report.roundingErrorNumerator,
        roundingErrorDenominator: value.report.roundingErrorDenominator,
        noteCount: value.report.noteCount,
        markerCount: value.report.markerCount,
        byteLength: value.report.byteLength,
        totalTicks: value.report.totalTicks,
        filename: value.report.filename,
        losses: value.report.losses,
      };
      expect(projected).toEqual(fixtureCase.expectedReport);
    });
  }

  test("the report carries the frozen writer, format, and identity pins", async () => {
    const fixtureCase = await requireGoldenCase("E1-GLD-001");
    const value = requireExported(exportMidi(await goldenRequest("E1-GLD-001")));
    expect(value.report.schema).toBe(MIDI_EXPORT_REPORT_SCHEMA);
    expect(value.report.writerId).toBe(MIDI_EXPORT_WRITER_ID);
    expect(value.report.writerVersion).toBe(MIDI_EXPORT_WRITER_VERSION);
    expect(value.report.format).toBe(MIDI_EXPORT_FORMAT);
    expect(value.report.division).toBe(MIDI_EXPORT_DIVISION);
    expect(value.report.trackCount).toBe(MIDI_EXPORT_TRACK_COUNT);
    expect(value.report.requestId).toBe(fixtureCase.request.requestId);
    expect(String(value.report.documentId)).toBe(
      fixtureCase.request.documentId,
    );
    expect(value.report.sourceRevision).toBe(
      (await loadGoldenFixture()).requestDefaults.sourceRevision,
    );
  });

  test("the rational rounding error is bounded by one half", async () => {
    for (const caseId of GOLDEN_IDS) {
      const value = requireExported(exportMidi(await goldenRequest(caseId)));
      expect(
        value.report.roundingErrorNumerator * 2,
      ).toBeLessThanOrEqual(value.report.roundingErrorDenominator);
    }
  });

  test("the filename follows the frozen law for every golden", async () => {
    for (const caseId of GOLDEN_IDS) {
      const fixtureCase = await requireGoldenCase(caseId);
      const value = requireExported(exportMidi(await goldenRequest(caseId)));
      expect(value.report.filename).toBe(
        `changes-${fixtureCase.planSpec.documentId}.mid`,
      );
      expect(value.report.filename.length).toBeLessThanOrEqual(64);
    }
  });
});
