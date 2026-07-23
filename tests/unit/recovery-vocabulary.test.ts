import { describe, expect, test } from "bun:test";

import { RECOVERY_STATUS_VOCABULARY } from "../../src/persistence";

describe("TR-A1-VOCABULARY frozen recovery status strings", () => {
  test("the five strings match the reviewed vocabulary exactly", () => {
    expect(RECOVERY_STATUS_VOCABULARY).toEqual({
      recoveredLocally: "Recovered locally at {time}",
      changesPending: "Changes pending recovery",
      unavailable: "Recovery unavailable — export recommended",
      exportedAtRevision: "Exported at revision {revision}",
      changedSinceExport: "Changed since export",
    });
  });

  test("no string calls recovery a save and only frozen substitutions exist", () => {
    for (const value of Object.values(RECOVERY_STATUS_VOCABULARY)) {
      expect(/save/iu.test(value)).toBe(false);
      const substitutions = value.match(/\{[a-z]+\}/gu) ?? [];
      for (const token of substitutions) {
        expect(["{time}", "{revision}"]).toContain(token);
      }
    }
  });
});
