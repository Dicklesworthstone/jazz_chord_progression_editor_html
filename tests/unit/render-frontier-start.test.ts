/**
 * jcpe-70yb start rule, checked against a direct simulation: step the
 * playhead and the render frontier forward in small increments and require
 * the frontier to stay `margin` ahead until it reaches the end. The rule may
 * never permit a start the simulation says would be overtaken, and should
 * not demand much more prefix than the simulation needs.
 */
import { expect, test } from "bun:test";

import { renderFrontierAllowsStart } from "../../src/application/playback-preparation-plan";

function simulationSafe(f: number, total: number, cost: number, margin: number): boolean {
  if (f >= total) return true;
  for (let t = 0; ; t += 0.01) {
    const frontier = f + t / cost;
    if (frontier >= total) return true;
    if (frontier < t + margin) return false;
  }
}

test("fast renders start after the margin; slow renders need the proportional prefix", () => {
  const allow = (f: number, total: number, cost: number, margin = 2) =>
    renderFrontierAllowsStart({ frontierSeconds: f, runSeconds: total, wallSecondsPerMusicSecond: cost, safetyFactor: 1, marginSeconds: margin });
  // Rendering twice as fast as playback: only the margin is needed.
  expect(allow(2, 64, 0.5)).toBe(true);
  expect(allow(1.9, 64, 0.5)).toBe(false);
  // Rendering at half speed (cost 2) over 64 s: f >= (64 + 2) / 2 = 33.
  expect(allow(33, 64, 2)).toBe(true);
  expect(allow(32.9, 64, 2)).toBe(false);
  // A fully rendered pass always starts; a nonsense measurement never does.
  expect(allow(64, 64, 50)).toBe(true);
  expect(allow(10, 64, Number.NaN)).toBe(false);
  expect(allow(10, 64, 0)).toBe(false);
});

test("the rule never permits a start the simulation says is overtaken, and is nearly tight", () => {
  for (const total of [8, 30, 64, 128]) {
    for (const cost of [0.25, 0.8, 1, 1.3, 2, 4]) {
      for (const margin of [0.5, 2]) {
        let firstAllowed: number | null = null;
        let firstSafe: number | null = null;
        for (let f = 0; f <= total; f += 0.25) {
          const allowed = renderFrontierAllowsStart({ frontierSeconds: f, runSeconds: total, wallSecondsPerMusicSecond: cost, safetyFactor: 1, marginSeconds: margin });
          const safe = simulationSafe(f, total, cost, margin);
          if (allowed) expect({ total, cost, margin, f, safe }).toEqual({ total, cost, margin, f, safe: true });
          if (allowed && firstAllowed === null) firstAllowed = f;
          if (safe && firstSafe === null) firstSafe = f;
        }
        // Within half a second of the simulated minimum prefix.
        expect((firstAllowed ?? total) - (firstSafe ?? total)).toBeLessThanOrEqual(0.5);
      }
    }
  }
});
