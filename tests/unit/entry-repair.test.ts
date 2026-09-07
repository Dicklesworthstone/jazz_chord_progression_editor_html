import { describe, expect, test } from "bun:test";
import { entryRepairRangeIsCurrent } from "../../src/ui/studio/EntryRepair";
import { diagnosticProse } from "../../src/ui/studio/entry-diagnostics";
import { ENTRY_INVALID_RANGES, ENTRY_SELECTION_CASES } from "../fixtures/entry-repair";

describe("entry repair preserves exact source selection", () => {
  for (const row of ENTRY_SELECTION_CASES) {
    test(row.id, () => {
      const target = { draftText: row.draft, sourceText: row.selected, start: row.start, end: row.end };
      expect(entryRepairRangeIsCurrent(target, row.draft)).toBe(true);
      expect(entryRepairRangeIsCurrent(target, ` ${row.draft}`)).toBe(false);
      expect(entryRepairRangeIsCurrent({ ...target, sourceText: "wrong slice" }, row.draft)).toBe(false);
    });
  }
  test("refuses malformed, out-of-bounds and split-surrogate ranges", () => {
    for (const row of ENTRY_INVALID_RANGES) {
      expect(entryRepairRangeIsCurrent({ ...row, draftText: row.draft, sourceText: row.draft.slice(row.start, row.end) }, row.draft)).toBe(false);
    }
    for (const start of [NaN, Infinity, -Infinity]) {
      expect(entryRepairRangeIsCurrent({ draftText: "C", sourceText: "", start, end: 0 }, "C")).toBe(false);
    }
  });
  test("same-length edit outside diagnostic span invalidates old diagnostic", () => {
    expect(entryRepairRangeIsCurrent({ draftText: "C7 H7", sourceText: "H", start: 3, end: 4 }, "D7 H7")).toBe(false);
  });
  test("keeps existing prose and unknown-code fallback", () => {
    expect(diagnosticProse("symbol.root_invalid")).toContain("root note");
    expect(diagnosticProse("chart.duration_invalid")).toContain(":1/2");
    expect(diagnosticProse("future.unknown")).toBe("This part of the draft couldn't be read.");
  });
});
