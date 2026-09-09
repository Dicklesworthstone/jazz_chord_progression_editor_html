import { expect, test } from "bun:test";
import { computeAutomationSpans, M1_EMPTY_IMPORT_OVERRIDES, type M1ImportOverrides, type M1RoleTrack } from "../../src/export/midi-import-automation";
import { createStudioMidiImport } from "../../src/application/studio-midi-import";
import { realDecodeFrame } from "../support/midi-import-test-kit";
import { midiGridFixture } from "../support/midi-grid-fixture";

const meter = [{ tick: 0, numerator: 4, denominatorPower: 2 }];
function tracks(transpose = 0): readonly M1RoleTrack[] {
  return [{ role: "harmony", notes: [60, 62, 64, 66].flatMap((root, index) =>
    [0, 4, 7].map((offset) => ({ channel: 0, key: root + offset + transpose, onTick: index * 480, offTick: (index + 1) * 480, onVelocity: 96 }))),
  }];
}

test("grid caps exact boundaries across all12 transpositions without changing source notes", () => {
  for (let transpose = 0; transpose < 12; transpose += 1) {
    const input = tracks(transpose);
    const before = JSON.stringify(input);
    for (const [grid, expected] of [
      ["bar", [[0, 1920]]], ["half-bar", [[0, 960], [960, 1920]]],
      ["quarter-bar", [[0, 480], [480, 960], [960, 1440], [1440, 1920]]],
    ] as const) {
      const result = computeAutomationSpans(480, meter, input, grid);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.refusal.code);
      expect(result.spans.map((span) => [span.startTick, span.endTick])).toEqual(expected.map((span) => [...span]));
      expect(JSON.stringify(input)).toBe(before);
    }
    expect(computeAutomationSpans(480, meter, input)).toEqual(computeAutomationSpans(480, meter, input, "quarter-bar"));
  }
});

test("sustained material never forces splits and odd ticks put the remainder left", () => {
  const sustained: readonly M1RoleTrack[] = [{ role: "harmony", notes: [60, 64, 67].map((key) => ({ channel: 0, key, onTick: 0, offTick: 1920, onVelocity: 96 })) }];
  for (const grid of [null, "bar", "half-bar", "quarter-bar"] as const) {
    const result = computeAutomationSpans(480, meter, sustained, grid);
    expect(result.ok && result.spans.length).toBe(1);
  }
  const odd: readonly M1RoleTrack[] = [{ role: "harmony", notes: [
    ...[60, 64, 67].map((key) => ({ channel: 0, key, onTick: 0, offTick: 2, onVelocity: 96 })),
    ...[62, 65, 69].map((key) => ({ channel: 0, key, onTick: 2, offTick: 3, onVelocity: 96 })),
  ] }];
  const result = computeAutomationSpans(1, [{ tick: 0, numerator: 3, denominatorPower: 2 }], odd, "half-bar");
  expect(result.ok && result.spans.map((span) => [span.startTick, span.endTick])).toEqual([[0, 2], [2, 3]]);
});

test("coarse refusal recovers from retained bytes with names and automatic trace restored", async () => {
  const importer = createStudioMidiImport(realDecodeFrame);
  const original = await importer.readFile("Grid.mid", midiGridFixture());
  expect(original.automation?.spans).toHaveLength(4);
  const coarse = importer.replanWithOverrides(original, { ...M1_EMPTY_IMPORT_OVERRIDES, grid: "bar" });
  expect(coarse.automation).toBeNull();
  expect(JSON.stringify(coarse.trace)).toContain("grid-override");
  const recovered = importer.replanWithOverrides(coarse, { ...M1_EMPTY_IMPORT_OVERRIDES, grid: "quarter-bar", sectionNames: [{ startMeasureIndex: 0, name: "Recovered" }] });
  expect(recovered.automation?.spans).toHaveLength(4);
  expect(recovered.automation?.sections[0]?.name).toBe("Recovered");
  expect(recovered.decoded).toBe(original.decoded);
  const segment = recovered.automation?.trace.find((record) => record.stage === "segment");
  expect(segment?.workCounters["maxDepth"]).toBe(2);
  expect(segment?.workCounters["maxSpansPerMeasure"]).toBe(4);
  expect(importer.replanWithOverrides(recovered, M1_EMPTY_IMPORT_OVERRIDES).automation).toEqual(original.automation);
  const invalid = importer.replanWithOverrides(original, { ...M1_EMPTY_IMPORT_OVERRIDES, grid: "unknown" } as unknown as M1ImportOverrides);
  expect(invalid.automation?.chartText).toBe(original.automation?.chartText);
  expect(JSON.stringify(invalid.trace)).toContain("dropped-grid");
});


test("grid evidence survives truncation of a long source trace", async () => {
  const importer = createStudioMidiImport(realDecodeFrame);
  const preview = await importer.readFile("Long grid.mid", midiGridFixture(0, 513));
  const explicit = importer.replanWithOverrides(preview, { ...M1_EMPTY_IMPORT_OVERRIDES, grid: "quarter-bar" });
  const segment = explicit.trace.records.find((record) => record.stage === "segment");
  expect(segment?.workCounters["spans"]).toBe(2052);
  expect(segment?.decisions.some((decision) => decision.outcome === "truncated")).toBe(true);
  expect(segment?.decisions.some((decision) => decision.outcome === "grid-override")).toBe(true);
});
