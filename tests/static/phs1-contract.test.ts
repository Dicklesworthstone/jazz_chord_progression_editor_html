import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { validatePhs1Contract } from "../../scripts/validate-phs1-contract";

type Property = "controls" | "expectedFindingCode" | "pointer" | "target" | "value";
type Obj = Record<string, unknown> & Partial<Record<Property, unknown>>;
const root = new URL("../fixtures/physical-foundry", import.meta.url).pathname;
function obj(value: unknown): Obj { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("PHS1_TEST_OBJECT"); return value as Obj; }
async function readObj(path: string): Promise<Obj> { return obj(JSON.parse(await readFile(path, "utf8")) as unknown); }
function replacePointer(document: Obj, pointer: string, value: unknown): void {
  const parts = pointer.slice(1).split("/").map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
  let current: unknown = document;
  for (const part of parts.slice(0, -1)) current = Array.isArray(current) ? current[Number(part)] : obj(current)[part];
  const last = parts.at(-1); if (last === undefined) throw new Error("PHS1_TEST_POINTER");
  if (Array.isArray(current)) current[Number(last)] = value; else obj(current)[last] = value;
}

describe("PHS1 offline foundry contract", () => {
  test("the independently authored packet validates", async () => {
    expect(await validatePhs1Contract()).toEqual({
      schema: "changes.validation.phs1-foundry-contract.v1", package: "PHS1", outcome: "pass",
      counts: { packCases: 8, metricCases: 16, metricFamilies: 15, authorities: 4, traces: 6, mutationControls: 11 }, findings: [],
    });
  });

  test("each reviewed mutation produces its named diagnostic", async () => {
    const mutationDoc = await readObj(join(root, "mutation-controls.json"));
    const controls = mutationDoc.controls;
    if (!Array.isArray(controls)) throw new Error("PHS1_TEST_CONTROLS");
    for (const value of controls) {
      const control = obj(value); const target = control.target; const pointer = control.pointer; const code = control.expectedFindingCode;
      if (typeof target !== "string" || typeof pointer !== "string" || typeof code !== "string") throw new Error("PHS1_TEST_CONTROL_SHAPE");
      const temporary = await mkdtemp(join(tmpdir(), "phs1-contract-"));
      try {
        await cp(root, temporary, { recursive: true });
        const path = join(temporary, target); const document = await readObj(path);
        replacePointer(document, pointer, control.value); await writeFile(path, `${JSON.stringify(document, null, 2)}\n`);
        const report = await validatePhs1Contract(temporary);
        expect(report.outcome, String(control.id)).toBe("fail");
        expect(report.findings.map((finding) => finding.code), String(control.id)).toContain(code);
      } finally { await rm(temporary, { recursive: true, force: true }); }
    }
  });

  test("public and aggregate commands are registered", async () => {
    const [architecture, packageJson, verify] = await Promise.all([
      readFile(new URL("../../docs/ARCHITECTURE.md", import.meta.url), "utf8"),
      readFile(new URL("../../package.json", import.meta.url), "utf8"),
      readFile(new URL("../../scripts/verify.ts", import.meta.url), "utf8"),
    ]);
    expect(architecture).toContain("bun run validate:phs1-contract");
    expect(packageJson).toContain('"validate:phs1-contract": "bun scripts/validate-phs1-contract.ts"');
    expect(verify).toContain('id: "phs1-offline-foundry-contract"');
  });
});
