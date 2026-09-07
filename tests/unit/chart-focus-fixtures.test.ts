import { expect, test } from "bun:test";
import { CHART_FOCUS_ANCHORS } from "../fixtures/chart-focus";

test("independent chart-focus anchor arithmetic includes exact bounds and fractional offsets", () => {
  for (const row of CHART_FOCUS_ANCHORS) {
    expect(Math.max(0, Math.min(row.maximum, row.scroll + row.after - row.before))).toBe(row.expected);
  }
});
