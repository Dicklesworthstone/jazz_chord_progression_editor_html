import { describe, expect, test } from "bun:test";

import {
  analyzeSourcePolicy,
  inspectProjectSourcePolicy,
  SOURCE_POLICY_CODES,
  type VirtualSource,
} from "../../scripts/source-policy";

const FORBIDDEN_UI_EDGES = Object.freeze([
  "audio",
  "compatibility",
  "content",
  "export",
  "persistence",
  "playback",
  "theory",
] as const);

function forbiddenEdgeSources(): readonly VirtualSource[] {
  return FORBIDDEN_UI_EDGES.flatMap((layer, index) => [
    {
      path: `src/ui/u0-edge-runtime-${String(index)}.ts`,
      source: `import { value } from "../${layer}"; void value;`,
    },
    {
      path: `src/ui/u0-edge-type-${String(index)}.ts`,
      source: `export type { Value } from "../${layer}";`,
    },
  ]);
}

describe("TR-U0-BOUNDARY UI layer and application-intent seam", () => {
  test("U0-REF-006 actual source graph allows UI to import only domain/application public boundaries", async () => {
    const report = await inspectProjectSourcePolicy();
    expect(report.outcome).toBe("pass");
    expect(report.findings).toEqual([]);
  });

  test("U0-REF-006 counterfactual runtime, type-only, and re-export edges all refuse", () => {
    const sources = forbiddenEdgeSources();
    const findings = analyzeSourcePolicy(sources);
    expect(findings).toHaveLength(sources.length);
    expect(
      findings.every(
        ({ code }) => code === SOURCE_POLICY_CODES.boundaryLayerDirection,
      ),
    ).toBe(true);
  });

  test("U0-STALE-002 U0-STALE-003 U0-STALE-005 UI may consume application selectors but cannot reach application private modules", () => {
    const findings = analyzeSourcePolicy([
      {
        path: "src/ui/allowed-selector.ts",
        source: 'import type { ApplicationSelectors } from "../application"; export type Seen = ApplicationSelectors;',
      },
      {
        path: "src/ui/forbidden-private-state.ts",
        source: 'import { state } from "../application/private/state"; void state;',
      },
    ]);
    expect(findings.filter(({ path }) => path.endsWith("allowed-selector.ts"))).toEqual([]);
    expect(
      findings.some(
        ({ code, path }) =>
          path.endsWith("forbidden-private-state.ts") &&
          code === SOURCE_POLICY_CODES.boundaryPrivateImport,
      ),
    ).toBe(true);
  });
});
