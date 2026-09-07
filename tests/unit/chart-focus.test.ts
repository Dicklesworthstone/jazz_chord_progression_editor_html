import { expect, test } from "bun:test";
import { anchoredChartScroll } from "../../src/ui/studio/chart-focus";
import { CHART_FOCUS_ANCHORS } from "../fixtures/chart-focus";

for (const row of CHART_FOCUS_ANCHORS) {
  test(`chart-focus reading anchor: ${row.name}`, () => {
    expect(anchoredChartScroll(row.scroll, row.before, row.after, row.maximum)).toBe(row.expected);
  });
}
