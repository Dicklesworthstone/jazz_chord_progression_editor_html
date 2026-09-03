import { describe, expect, test } from "bun:test";

import "../../ios/TheoryBridgeSource/entry";

type NativeBridge = Readonly<{
  continuations(raw: string): string;
}>;

function bridge(): NativeBridge {
  return (globalThis as typeof globalThis & { FrankenJazzTheoryBridge: NativeBridge })
    .FrankenJazzTheoryBridge;
}

describe("native iOS theory bridge", () => {
  test("surfaces the source-owned G2 cadence result with bounded proof fields", () => {
    const response = JSON.parse(
      bridge().continuations(JSON.stringify({
        schema: "frankenjazz.native-continuation-request.v1",
        context: ["Dm7", "G7"],
      })),
    ) as Record<string, unknown>;

    expect(response["schema"]).toBe("frankenjazz.native-continuation-response.v1");
    expect(response["ok"]).toBe(true);
    expect(response["engineSchema"]).toBe("changes.continuation-result.v1");
    const candidates = response["candidates"] as Array<Record<string, unknown>>;
    expect(candidates).toHaveLength(4);
    expect(candidates[0]).toMatchObject({
      chordSymbol: "Cmaj7",
      category: "functional",
      providerId: "provider.functional.circle-cadence",
      rank: 1,
      expectedMotion: "cycle-fifth",
      preservedGuideTones: true,
    });
  });

  test("turns malformed or oversized native requests into typed refusals", () => {
    for (const raw of ["", "{}", "x".repeat(16_385)]) {
      const response = JSON.parse(bridge().continuations(raw)) as {
        ok: boolean;
        refusal: { code: string };
      };
      expect(response.ok).toBe(false);
      expect(response.refusal.code).toBe("native.bridge_refused");
    }
  });
});
