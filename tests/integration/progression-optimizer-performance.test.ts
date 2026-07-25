import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  assignVoiceTransition,
  initializeVoiceFrame,
  runToTerminalWithRealOracle,
  type VoiceAssignmentOperations,
} from "../support/progression-optimizer-real-oracle";

setDefaultTimeout(240_000);

/**
 * Performance observations for the plan's 64-event four-voice section:
 * 100 ms interactive target, 500 ms release ceiling, both enforced by the
 * release-proof milestone on the CI reference runner. This build-phase test
 * records the observation and holds a 10 s engineering smoke ceiling (the
 * bound tolerates a heavily loaded shared dev runner while still catching
 * the uncached ~15 s regression; the recorded value is the evidence): the
 * remaining floor is the real V1 per-transition call cost (~3 ms each,
 * tracked as its own optimization bead), not V2 search work — V2's
 * content-addressed oracle cache already collapses the 64-event chart to
 * the distinct chord-shape pairs. The outcome-equality assertion proves
 * timing never selects, truncates, or reorders output.
 */
describe("V2 performance observations (observation only, never semantic)", () => {
  const realOperations: VoiceAssignmentOperations = {
    initializeVoiceFrame,
    assignVoiceTransition,
  };

  test("64-event four-voice optimization is observed against the release targets", () => {
    const startedAt = performance.now();
    const first = runToTerminalWithRealOracle(
      realOperations,
      64,
      12,
      "v2-perf-64",
      { voicesPerCandidate: 4 },
    );
    const elapsedMs = performance.now() - startedAt;
    expect(first.outcome.kind).toBe("optimized");
    if (first.outcome.kind !== "optimized") return;
    expect(first.outcome.termination).toBe("complete");
    expect(first.outcome.segments[0]?.realizations[0]?.candidateIds).toHaveLength(
      64,
    );
    expect(
      elapsedMs,
      `observed ${elapsedMs.toFixed(1)} ms against the 100 ms target / 500 ms release ceiling (release gate enforces on the CI reference runner; V1 per-call cost bead tracks the floor)`,
    ).toBeLessThanOrEqual(10_000);
    const second = runToTerminalWithRealOracle(
      realOperations,
      64,
      12,
      "v2-perf-64",
      { voicesPerCandidate: 4 },
    );
    expect(second.outcome).toEqual(first.outcome);
  });
});
