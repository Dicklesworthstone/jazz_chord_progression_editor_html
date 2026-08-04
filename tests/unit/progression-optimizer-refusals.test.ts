import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { initializeProgressionOptimization } from "../../src/theory";
import {
  buildRequest,
  buildStubOperations,
  pathToPointer,
  requireCase,
  type JsonObject,
} from "../support/progression-optimizer-test-kit";

setDefaultTimeout(240_000);

const REFUSAL_CASES = [
  "V2-OPT-R01",
  "V2-OPT-R02",
  "V2-OPT-R03",
  "V2-OPT-R04",
  "V2-OPT-R05",
  "V2-OPT-R06",
  "V2-OPT-R07",
  "V2-OPT-R08",
  "V2-OPT-R09",
  "V2-OPT-R10",
  "V2-OPT-R11",
  "V2-OPT-R12",
  "V2-LIM-004",
  "V2-LIM-006",
  "V2-LIM-007",
  "V2-LIM-008",
] as const;

describe("V2-TRACE-REFUSALS every code fires from its near-miss with its pointer", () => {
  for (const id of REFUSAL_CASES) {
    test(`${id} refuses with the documented code and path`, async () => {
      const fixture = await requireCase(id);
      const expected = (fixture.record["expected"] as JsonObject)[
        "refusal"
      ] as JsonObject;
      const request = buildRequest(fixture);
      const operations = buildStubOperations(fixture);
      const result = initializeProgressionOptimization(request, operations);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.refusal.code).toBe(
        expected["code"] as typeof result.refusal.code,
      );
      expect(pathToPointer(result.refusal.path)).toBe(
        expected["pointer"] as string,
      );
      expect(result.refusal.partialResult).toBe(false);
    });
  }
});
