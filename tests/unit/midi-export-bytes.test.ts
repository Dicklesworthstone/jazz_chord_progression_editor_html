/**
 * E1-TRACE-BYTES and E1-TRACE-GATES evidence.
 *
 * Production bytes must equal the hand-assembled fixture goldens exactly,
 * parse independently with the kit's own minimal SMF reader into the
 * expected event model, refuse oversized variable-length deltas, and keep
 * exact gates (a one-tick duration keeps its full gate). Expected values
 * come only from the reviewed fixtures.
 */
import { describe, expect, test } from "bun:test";

import { exportMidi } from "../../src/export";
import {
  bytesToHex,
  deepFreezeRequest,
  goldenRequest,
  loadGoldenFixture,
  overriddenBaseRequest,
  parseSmfBytes,
  pathToPointer,
  requireExported,
  requireGoldenCase,
  requireRefusal,
} from "../support/midi-export-test-kit";

const BYTE_CASE_IDS = [
  "E1-GLD-001",
  "E1-GLD-002",
  "E1-GLD-003",
  "E1-GLD-004",
  "E1-GLD-005",
  "E1-GLD-006",
] as const;

describe("E1 byte determinism against the fixture goldens", () => {
  for (const caseId of BYTE_CASE_IDS) {
    test(`${caseId}: production bytes equal the hand-assembled golden`, async () => {
      const fixtureCase = await requireGoldenCase(caseId);
      const value = requireExported(exportMidi(await goldenRequest(caseId)));
      expect(bytesToHex(value.bytes)).toBe(fixtureCase.bytesHex);
      expect(value.report.byteLength).toBe(value.bytes.length);
    });

    test(`${caseId}: production bytes parse independently into the expected model`, async () => {
      const fixtureCase = await requireGoldenCase(caseId);
      const value = requireExported(exportMidi(await goldenRequest(caseId)));
      const parsed = parseSmfBytes(value.bytes);
      expect(parsed.format).toBe(1);
      expect(parsed.trackCount).toBe(2);
      expect(parsed.division).toBe(960);
      expect(parsed.tracks[0]).toEqual(fixtureCase.expectedModel.track0);
      expect(parsed.tracks[1]).toEqual(fixtureCase.expectedModel.track1);
    });
  }

  test("exporting the same request twice yields identical bytes", async () => {
    const first = requireExported(exportMidi(await goldenRequest("E1-GLD-002")));
    const second = requireExported(
      exportMidi(await goldenRequest("E1-GLD-002")),
    );
    expect(bytesToHex(second.bytes)).toBe(bytesToHex(first.bytes));
  });

  test("a deeply frozen request exports without mutation", async () => {
    const request = deepFreezeRequest(await goldenRequest("E1-GLD-001"));
    const fixtureCase = await requireGoldenCase("E1-GLD-001");
    const value = requireExported(exportMidi(request));
    expect(bytesToHex(value.bytes)).toBe(fixtureCase.bytesHex);
  });

  test("the exported value and report are frozen", async () => {
    const value = requireExported(exportMidi(await goldenRequest("E1-GLD-001")));
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.report)).toBe(true);
    expect(Object.isFrozen(value.report.losses)).toBe(true);
  });
});

describe("E1 variable-length quantity law (E1-REF-015, E1-LIM-004)", () => {
  test("E1-REF-015: a delta above 0x0FFFFFFF refuses midi.vlq_overflow", async () => {
    const refusal = requireRefusal(
      exportMidi(
        await overriddenBaseRequest({
          path: "/plan",
          value: "sparse-event-at-tick-268435456",
        }),
      ),
    );
    expect(refusal.code).toBe("midi.vlq_overflow");
    expect(pathToPointer(refusal.path)).toBe("/plan/events/0/startTick");
    expect(refusal.partialResult).toBe(false);
  });

  test("E1-LIM-004: a delta of exactly 0x0FFFFFFF exports and round-trips", async () => {
    const request = await overriddenBaseRequest({
      path: "/plan/events/0/startTick",
      value: "shift-event-to-max-vlq",
    });
    const value = requireExported(exportMidi(request));
    const parsed = parseSmfBytes(value.bytes);
    const track1 = parsed.tracks[1] ?? [];
    const firstOn = track1.find((event) => event["kind"] === "on");
    expect(firstOn?.["tick"]).toBe(0x0f_ff_ff_ff - 960);
  });
});

describe("E1 exact gates (E1-GLD-004, E1-REF-011)", () => {
  test("E1-GLD-004: a one-tick duration keeps its full gate", async () => {
    const value = requireExported(exportMidi(await goldenRequest("E1-GLD-004")));
    const parsed = parseSmfBytes(value.bytes);
    const track1 = parsed.tracks[1] ?? [];
    const on = track1.find((event) => event["kind"] === "on");
    const off = track1.find((event) => event["kind"] === "off");
    expect(on?.["tick"]).toBe(0);
    expect(off?.["tick"]).toBe(1);
  });

  test("E1-REF-011: a zero gate refuses midi.gate_invalid", async () => {
    const refusal = requireRefusal(
      exportMidi(
        await overriddenBaseRequest({
          path: "/plan/events/0/gateDurationTicks",
          value: 0,
        }),
      ),
    );
    expect(refusal.code).toBe("midi.gate_invalid");
    expect(pathToPointer(refusal.path)).toBe(
      "/plan/events/0/gateDurationTicks",
    );
  });

  test("a gate above its duration refuses midi.gate_invalid", async () => {
    const refusal = requireRefusal(
      exportMidi(
        await overriddenBaseRequest({
          path: "/plan/events/0/gateDurationTicks",
          value: 961,
        }),
      ),
    );
    expect(refusal.code).toBe("midi.gate_invalid");
  });
});

describe("E1 fixture inventory", () => {
  test("the golden fixture carries exactly the six reviewed cases", async () => {
    const fixture = await loadGoldenFixture();
    expect(fixture.cases.map((fixtureCase) => fixtureCase.id)).toEqual([
      ...BYTE_CASE_IDS,
    ]);
  });
});
