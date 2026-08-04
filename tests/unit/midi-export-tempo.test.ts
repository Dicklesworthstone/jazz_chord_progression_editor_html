/**
 * E1-TRACE-TEMPO and E1-TRACE-METER evidence.
 *
 * Integer tempo encodes as the nearest microseconds per quarter with the
 * exact rational rounding error reported; 20 and 400 are inclusive bounds.
 * The time-signature meta carries beatsPerBar, log2(beatUnit), 24, 8, and
 * non-power-of-two units refuse. Expected values come only from the
 * reviewed fixtures.
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

const TEMPO_CASES = [
  { id: "E1-GLD-001", bpm: 120, microseconds: 500_000, errorNumerator: 0 },
  { id: "E1-GLD-002", bpm: 90, microseconds: 666_667, errorNumerator: 30 },
  { id: "E1-GLD-005", bpm: 400, microseconds: 150_000, errorNumerator: 0 },
  { id: "E1-GLD-006", bpm: 20, microseconds: 3_000_000, errorNumerator: 0 },
] as const;

describe("E1 nearest-microsecond tempo law", () => {
  for (const tempoCase of TEMPO_CASES) {
    test(`${tempoCase.id}: ${String(tempoCase.bpm)} bpm encodes ${String(
      tempoCase.microseconds,
    )} microseconds with error ${String(tempoCase.errorNumerator)}/${String(
      tempoCase.bpm,
    )}`, async () => {
      const value = requireExported(
        exportMidi(await goldenRequest(tempoCase.id)),
      );
      const track0 = parseSmfBytes(value.bytes).tracks[0] ?? [];
      const tempoMeta = track0.find((event) => event["type"] === "tempo");
      expect(tempoMeta?.["microseconds"]).toBe(tempoCase.microseconds);
      expect(value.report.requestedBpm).toBe(tempoCase.bpm);
      expect(value.report.encodedMicrosecondsPerQuarter).toBe(
        tempoCase.microseconds,
      );
      expect(value.report.roundingErrorNumerator).toBe(
        tempoCase.errorNumerator,
      );
      expect(value.report.roundingErrorDenominator).toBe(tempoCase.bpm);
    });
  }

  test("E1-REF-007: tempo 401 refuses midi.tempo_invalid", async () => {
    const refusal = requireRefusal(
      exportMidi(
        await overriddenBaseRequest({ path: "/plan/tempoBpm", value: 401 }),
      ),
    );
    expect(refusal.code).toBe("midi.tempo_invalid");
    expect(pathToPointer(refusal.path)).toBe("/plan/tempoBpm");
  });

  test("tempo 19 refuses and non-integer tempo refuses", async () => {
    const below = requireRefusal(
      exportMidi(
        await overriddenBaseRequest({ path: "/plan/tempoBpm", value: 19 }),
      ),
    );
    expect(below.code).toBe("midi.tempo_invalid");
    const fractional = requireRefusal(
      exportMidi(
        await overriddenBaseRequest({ path: "/plan/tempoBpm", value: 120.5 }),
      ),
    );
    expect(fractional.code).toBe("midi.tempo_invalid");
  });
});

describe("E1 time-signature meta law", () => {
  test("E1-GLD-002: 6/8 encodes numerator 6 and denominator power 3", async () => {
    const value = requireExported(exportMidi(await goldenRequest("E1-GLD-002")));
    const track0 = parseSmfBytes(value.bytes).tracks[0] ?? [];
    const meterMeta = track0.find(
      (event) => event["type"] === "time-signature",
    );
    expect(meterMeta?.["numerator"]).toBe(6);
    expect(meterMeta?.["denominatorPower"]).toBe(3);
  });

  test("E1-REF-008: beat unit 6 refuses midi.meter_invalid", async () => {
    const refusal = requireRefusal(
      exportMidi(
        await overriddenBaseRequest({
          path: "/plan/meter/beatUnit",
          value: 6,
        }),
      ),
    );
    expect(refusal.code).toBe("midi.meter_invalid");
    expect(pathToPointer(refusal.path)).toBe("/plan/meter/beatUnit");
  });

  test("a beatsPerBar outside 1..255 refuses midi.meter_invalid", async () => {
    const refusal = requireRefusal(
      exportMidi(
        await overriddenBaseRequest({
          path: "/plan/meter/beatsPerBar",
          value: 256,
        }),
      ),
    );
    expect(refusal.code).toBe("midi.meter_invalid");
    expect(pathToPointer(refusal.path)).toBe("/plan/meter/beatsPerBar");
  });
});
