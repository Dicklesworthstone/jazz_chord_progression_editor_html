import { expect, test } from "bun:test";
import fixture from "../fixtures/progression-optimizer/continuity-policy-cases.json";
import {
  PROGRESSION_CONTINUITY_COST_POLICY_VERSION,
  PROGRESSION_CONTINUITY_COST_AXES,
  PROGRESSION_CONTINUITY_COST_AGGREGATIONS,
  PROGRESSION_CONTINUITY_COST_VALUE_LIMITS,
  PROGRESSION_COST_POLICY_VERSION,
  PROGRESSION_COST_AXES,
} from "../../src/theory";

function at<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error(`Missing fixture element ${String(index)}`);
  return value;
}

test("continuity policy pins nine explicit facts without changing legacy policy", () => {
  expect(PROGRESSION_COST_POLICY_VERSION).toBe(1);
  expect(PROGRESSION_COST_AXES).toHaveLength(7);
  expect(PROGRESSION_CONTINUITY_COST_POLICY_VERSION).toBe(fixture.policyVersion);
  expect([...PROGRESSION_CONTINUITY_COST_AXES].map(String)).toEqual(fixture.axes);
  expect(PROGRESSION_CONTINUITY_COST_AXES.map((axis): string =>
    PROGRESSION_CONTINUITY_COST_AGGREGATIONS[axis])).toEqual(fixture.aggregations);
  expect(PROGRESSION_CONTINUITY_COST_AXES.map((axis): number =>
    PROGRESSION_CONTINUITY_COST_VALUE_LIMITS[axis])).toEqual(fixture.caps);
});

test("hand-authored choices obey lexicographic ordering, with a killing old-policy counterexample", () => {
  for (const row of fixture.comparisons) {
    const choices = row.costs.map((cost, index) => ({cost, index}));
    choices.sort((a, b) => {
      for (let i = 0; i < 9; i += 1) {
        const difference = at(a.cost, i) - at(b.cost, i);
        if (difference !== 0) return difference;
      }
      const aPath = at(row.paths, a.index).join("/");
      const bPath = at(row.paths, b.index).join("/");
      return aPath < bPath ? -1 : aPath > bPath ? 1 : 0;
    });
    expect(at(choices, 0).index, row.id).toBe(row.winner);
  }
  const exploit = at(fixture.comparisons, 0);
  expect(at(at(exploit.costs, 0), 4)).toBeLessThan(at(at(exploit.costs, 1), 4));
  expect(exploit.winner).toBe(1);
});

test("sum/max fold and gap charges have explicit independent arithmetic", () => {
  expect(fixture.fold.expected).toEqual(fixture.axes.map((_, i) =>
    fixture.aggregations[i] === "sum"
      ? fixture.fold.edges.reduce((sum, edge) => sum + at(edge, i), 0)
      : Math.max(...fixture.fold.edges.map((edge) => at(edge, i)))));
  for (const row of fixture.transitions) {
    expect(row.alignmentCost).toBe(row.totalAbsoluteMotion + 12 * row.gapCount);
    expect(row.totalSpan).toBe(at(row.to, row.to.length - 1) - at(row.to, 0));
    expect(row.gapCount).toBeGreaterThanOrEqual(Math.abs(row.to.length - row.from.length));
  }
});
