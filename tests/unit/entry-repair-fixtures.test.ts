import { expect, test } from "bun:test";
import { ENTRY_INTERACTIONS, ENTRY_SELECTION_CASES } from "../fixtures/entry-repair";

test("independent entry-repair UTF-16 fixture spans identify their literal characters", () => {
  for (const row of ENTRY_SELECTION_CASES) {
    expect(row.draft.slice(row.start, row.end)).toBe(row.selected);
  }
  expect(new Set(ENTRY_INTERACTIONS.map(([id]) => id)).size).toBe(12);
});
