/**
 * M0-TRACE-WINDOW, M0-TRACE-GRID, M0-TRACE-GROUPING, and M0-TRACE-MEASURES
 * evidence.
 *
 * The sonority laws are proved twice: directly over the independently authored
 * note streams in `sonority-cases.json`, and end to end over the golden byte
 * corpus. Every window, grid index, quantized rational, error term, and
 * measure index compared here comes from the fixtures.
 */
import { describe, expect, test } from "bun:test";

import { groupSonorities } from "../../src/export/midi-import";
import {
  MIDI_IMPORT_GRID_DIVISIONS_PER_BEAT,
  MIDI_IMPORT_SIMULTANEITY_WINDOW_MICROSECONDS,
} from "../../src/export/midi-import-contract";
import {
  GOLDEN_CASES,
  SONORITY_CASES,
  decodeGolden,
  modelFromSonorityCase,
  requireDecoded,
  requireSonorityCase,
} from "../support/midi-import-test-kit";

describe("M0 sonority laws over independently authored note streams", () => {
  for (const entry of SONORITY_CASES) {
    test(`${entry.id} — ${entry.title}`, () => {
      const sonorities = groupSonorities(modelFromSonorityCase(entry));
      expect(sonorities).toEqual(entry.expected.sonorities);
    });
  }
});

describe("M0 sonority laws over the golden byte corpus", () => {
  for (const entry of GOLDEN_CASES) {
    test(`${entry.id} groups exactly as reviewed`, async () => {
      const decoded = requireDecoded(await decodeGolden(entry.id));
      expect(decoded.sonorities).toEqual(entry.expectedSonorities);
    });
  }
});

describe("M0 window law", () => {
  test("the window is a tempo-derived tick bound, inclusive at the bound", () => {
    const entry = requireSonorityCase("M0-SON-001");
    const sonorities = groupSonorities(modelFromSonorityCase(entry));
    const first = sonorities[0];
    expect(first).toBeDefined();
    const ppq = entry.input.ppq;
    const microseconds = first?.tempoMicrosecondsAtAnchor ?? 0;
    expect(first?.windowTicks).toBe(
      Math.floor(
        (MIDI_IMPORT_SIMULTANEITY_WINDOW_MICROSECONDS * ppq) / microseconds,
      ),
    );
    /* A note exactly at the bound joins; one tick later opens a new sonority. */
    expect(first?.memberCount).toBe(2);
    expect(sonorities.length).toBe(2);
  });

  test("windows never chain across the anchor", () => {
    const entry = requireSonorityCase("M0-SON-002");
    const sonorities = groupSonorities(modelFromSonorityCase(entry));
    expect(sonorities.length).toBe(2);
    expect(sonorities[1]?.anchorTick).toBe(76);
  });
});

describe("M0 grid law", () => {
  test("the grid divides each beat into the frozen number of cells", () => {
    expect(MIDI_IMPORT_GRID_DIVISIONS_PER_BEAT).toBe(4);
  });

  test("quantized ticks stay exact rationals over the beat unit", () => {
    const entry = requireSonorityCase("M0-SON-005");
    const sonorities = groupSonorities(modelFromSonorityCase(entry));
    /* PPQ 3 in 2/2: a three-halves-tick cell that no integer tick can hold. */
    expect(sonorities[1]?.quantizedTickNumerator).toBe(3);
    expect(sonorities[1]?.quantizedTickDenominator).toBe(2);
    expect(sonorities[1]?.quantizationErrorNumerator).toBe(1);
  });
});

describe("M0 measure law", () => {
  test("every meter change starts a new measure and the count is an exact ceiling", () => {
    const entry = requireSonorityCase("M0-SON-006");
    const sonorities = groupSonorities(modelFromSonorityCase(entry));
    expect(sonorities.map((sonority) => sonority.measureIndex)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(sonorities.map((sonority) => sonority.segmentIndex)).toEqual([
      0, 0, 1, 1,
    ]);
  });
});
