import { expect, test } from "bun:test";

import abiFixtureValue from "../fixtures/physical-renderer/abi-cases.json";
import {
  type PhysicalRenderAbiRequestV2,
} from "../../src/audio";
import { loadConcertGrandRenderer } from "../../src/audio/dsp-renderer";

type JsonRecord = Readonly<Record<string, unknown>>;

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`PHYSICAL_ABI_FIXTURE_RECORD:${label}`);
  }
  return value as JsonRecord;
}

test("the Rust ABI-v2 boundary executes every reviewed valid, hostile, and limit layout", async () => {
  const fixture = record(abiFixtureValue, "root");
  const memoryBytes = fixture["linearMemoryBytes"];
  const cases = fixture["cases"];
  if (typeof memoryBytes !== "number" || !Array.isArray(cases)) {
    throw new Error("PHYSICAL_ABI_FIXTURE_SHAPE");
  }
  const positive = record(cases[0], "positive");
  const baseline = record(positive["request"], "positive.request");
  const renderer = await loadConcertGrandRenderer();

  for (const [index, candidate] of cases.entries()) {
    const row = record(candidate, `case.${String(index)}`);
    const request = {
      ...baseline,
      ...record(row["request"], `case.${String(index)}.request`),
    } as unknown as PhysicalRenderAbiRequestV2;
    const expected = record(row["expected"], `case.${String(index)}.expected`);
    const observed = renderer.validatePhysicalAbiV2(request, memoryBytes);
    const expectedCode = expected["outcome"] === "accepted"
      ? null
      : String(expected["code"]);
    expect(expectedCode, String(row["id"])).toBe(observed);
  }
});
