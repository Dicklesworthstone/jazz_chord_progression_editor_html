import { expect, test } from "bun:test";

import { runA0RandomizedProtocol } from
  "../support/a0-randomized-protocol";

/** Infrastructure watchdog only; no transition/search outcome reads wall time. */
const A0_EVIDENCE_HARNESS_TIMEOUT_MS = 3_600_000;

test("A0-PROP-1000 matches the independent model and deterministic replay after every action", async () => {
  const result = await runA0RandomizedProtocol({ kind: "authoritative" });
  expect(result.sequenceHashes).toHaveLength(1_000);
  expect(result.allActionKindsObserved).toBe(true);
}, A0_EVIDENCE_HARNESS_TIMEOUT_MS);
