/**
 * M0-TRACE-DECODE-BYTES, M0-TRACE-DECODE-DEFAULTS, M0-TRACE-DECODE-TOLERATED,
 * and M0-TRACE-CONDUCTOR evidence.
 *
 * The real embedded wasm decoder is driven over the independently authored
 * golden bytes and its decode model and counters are diffed against the
 * fixtures field by field. Every expectation comes from
 * `tests/fixtures/midi-import/golden-cases.json`; nothing here restates a
 * value the production pipeline produced.
 */
import { describe, expect, test } from "bun:test";

import {
  GOLDEN_CASES,
  decodeGolden,
  requireDecoded,
  requireGoldenCase,
} from "../support/midi-import-test-kit";

describe("M0 SMF decode model", () => {
  for (const entry of GOLDEN_CASES) {
    test(`${entry.id} decodes to the reviewed model — ${entry.title}`, async () => {
      const decoded = requireDecoded(await decodeGolden(entry.id));
      const model = decoded.model;
      const expected = entry.expectedModel;

      expect(model.header).toEqual(expected.header);
      expect(model.tempoMap).toEqual(expected.tempoMap);
      expect(model.meterMap).toEqual(expected.meterMap);
      expect(model.ignoredEvents).toEqual(expected.ignoredEvents);
      expect(model.alienChunks).toEqual(expected.alienChunks);

      expect(model.tracks.length).toBe(expected.tracks.length);
      for (let index = 0; index < expected.tracks.length; index += 1) {
        expect(model.tracks[index]).toEqual(expected.tracks[index]);
      }
    });

    test(`${entry.id} reports the reviewed deterministic counters`, async () => {
      const decoded = requireDecoded(await decodeGolden(entry.id));
      expect(decoded.model.counters).toEqual(entry.expectedCounters);
    });
  }
});

describe("M0 SMF defaults are a recorded law, never a repair", () => {
  test("M0-GLD-005 carries empty tempo and meter maps yet still quantizes", async () => {
    const entry = requireGoldenCase("M0-GLD-005");
    const decoded = requireDecoded(await decodeGolden(entry.id));
    expect(decoded.model.tempoMap).toEqual([]);
    expect(decoded.model.meterMap).toEqual([]);
    expect(decoded.sonorities).toEqual(entry.expectedSonorities);
  });

  test("M0-GLD-006 applies the 120 bpm default at the anchor", async () => {
    const entry = requireGoldenCase("M0-GLD-006");
    const decoded = requireDecoded(await decodeGolden(entry.id));
    expect(decoded.model.counters.tempoChanges).toBe(0);
    expect(decoded.sonorities).toEqual(entry.expectedSonorities);
  });
});

describe("M0 tolerated events are recorded, never dropped", () => {
  test("M0-GLD-003 ledgers every tolerated meta, sysex, channel message, and alien chunk", async () => {
    const entry = requireGoldenCase("M0-GLD-003");
    const decoded = requireDecoded(await decodeGolden(entry.id));
    const expected = entry.expectedModel;
    expect(decoded.model.ignoredEvents).toEqual(expected.ignoredEvents);
    expect(decoded.model.alienChunks).toEqual(expected.alienChunks);
    expect(decoded.model.counters.eventsIgnored).toBe(
      expected.ignoredEvents.length,
    );
  });
});

describe("M0 conductor stream", () => {
  test("M0-GLD-002 carries a mid-track tempo change as ordinary data", async () => {
    const entry = requireGoldenCase("M0-GLD-002");
    const decoded = requireDecoded(await decodeGolden(entry.id));
    expect(decoded.model.tempoMap).toEqual(entry.expectedModel.tempoMap);
  });

  test("M0-GLD-004 carries a mid-track meter change as ordinary data", async () => {
    const entry = requireGoldenCase("M0-GLD-004");
    const decoded = requireDecoded(await decodeGolden(entry.id));
    expect(decoded.model.meterMap).toEqual(entry.expectedModel.meterMap);
  });
});
