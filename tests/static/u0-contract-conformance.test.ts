import { describe, expect, test } from "bun:test";

import * as ui from "../../src/ui";
import {
  UI_BEHAVIOR_HELPER_COUNT,
  UI_COMPONENT_CONTRACT_COUNT,
  UI_COMPONENT_INVENTORY,
  UI_RENDER_COMPONENT_COUNT,
} from "../../src/ui/ui-contract";

type ComponentRow = Readonly<{
  id: string;
  name: string;
  family: string;
  kind: "behavior" | "render";
}>;

type PrimitiveMatrix = Readonly<{
  components: readonly ComponentRow[];
}>;

const fixture = await Bun.file(
  new URL("../fixtures/ui/primitive-state-matrix.json", import.meta.url),
).json() as PrimitiveMatrix;

type ExportSurface = Readonly<Record<string, unknown>>;

function inventoryFindings(
  expected: readonly ComponentRow[],
  surface: ExportSurface,
): readonly string[] {
  const findings: string[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const row of expected) {
    if (ids.has(row.id)) findings.push(`duplicate-id:${row.id}`);
    if (names.has(row.name)) findings.push(`duplicate-name:${row.name}`);
    ids.add(row.id);
    names.add(row.name);
    if (typeof surface[row.name] !== "function") {
      findings.push(`missing-callable:${row.id}:${row.name}`);
    }
  }
  return findings.sort();
}

describe("TR-U0-INVENTORY public U0 component contract", () => {
  test("U0-PRIM-001 binds all 49 render components and two behavior helpers to actual public callables", () => {
    const expected = fixture.components;
    expect(expected).toHaveLength(51);
    expect(expected.filter(({ kind }) => kind === "render")).toHaveLength(49);
    expect(expected.filter(({ kind }) => kind === "behavior")).toHaveLength(2);
    expect(inventoryFindings(expected, ui)).toEqual([]);

    expect(UI_RENDER_COMPONENT_COUNT).toBe(49);
    expect(UI_BEHAVIOR_HELPER_COUNT).toBe(2);
    expect(UI_COMPONENT_CONTRACT_COUNT).toBe(51);
    const productionInventory: readonly ComponentRow[] = UI_COMPONENT_INVENTORY;
    expect(productionInventory).toEqual(
      expected.map(({ id, name, family, kind }) => ({
        id,
        name,
        family,
        kind,
      })),
    );
  });

  test("U0-PRIM-001 semantic counterfactual detects a missing implementation even when the inventory fixture remains intact", () => {
    const damaged: Record<string, unknown> = { ...ui };
    const first = fixture.components[0];
    if (first === undefined) throw new Error("U0 inventory fixture is empty");
    Reflect.deleteProperty(damaged, first.name);
    expect(inventoryFindings(fixture.components, damaged)).toEqual([
      `missing-callable:${first.id}:${first.name}`,
    ]);
  });
});
