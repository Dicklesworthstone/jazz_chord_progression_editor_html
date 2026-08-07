import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validatePhs3Contract } from "../../scripts/validate-phs3-contract";

type Obj = Record<string, unknown>;
const root = new URL("../fixtures/flute-v2", import.meta.url).pathname;
function obj(value: unknown): Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("PHS3_TEST_OBJECT");
  return value as Obj;
}
async function readObj(path: string): Promise<Obj> { return obj(JSON.parse(await readFile(path, "utf8")) as unknown); }
function replace(doc: Obj, pointer: string, value: unknown): void {
  const parts = pointer.slice(1).split("/");
  let current: unknown = doc;
  for (const part of parts.slice(0, -1)) current = Array.isArray(current) ? current[Number(part)] : obj(current)[part];
  const last = parts.at(-1);
  if (last === undefined) throw new Error("PHS3_TEST_POINTER");
  if (Array.isArray(current)) current[Number(last)] = value;
  else obj(current)[last] = value;
}

describe("PHS3 flute v2 contract", () => {
  test("independent packet validates", async () => {
    expect(await validatePhs3Contract()).toEqual({
      schema: "changes.validation.phs3-flute-v2.v1", package: "PHS3", outcome: "pass",
      counts: { physicsCases: 14, metricCases: 12, metricFamilies: 9, fingerings: 4, authorities: 4, traceRequirements: 5, mutationControls: 13 }, findings: [],
    });
  });
  test("reviewed mutations produce named findings", async () => {
    const controls = (await readObj(join(root, "mutation-controls.json")))["controls"];
    if (!Array.isArray(controls)) throw new Error("PHS3_TEST_CONTROLS");
    for (const raw of controls) {
      const control = obj(raw), temporary = await mkdtemp(join(tmpdir(), "phs3-contract-"));
      try {
        await cp(root, temporary, { recursive: true });
        const path = join(temporary, String(control["target"])), doc = await readObj(path);
        replace(doc, String(control["pointer"]), control["value"]);
        await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`);
        const report = await validatePhs3Contract(temporary);
        expect(report.findings.map((finding) => finding.code), String(control["id"])).toContain(String(control["expectedFindingCode"]));
      } finally { await rm(temporary, { recursive: true, force: true }); }
    }
  });
  test("commands are registered", async () => {
    const [pkg, architecture, verify] = await Promise.all([
      readFile(new URL("../../package.json", import.meta.url), "utf8"),
      readFile(new URL("../../docs/ARCHITECTURE.md", import.meta.url), "utf8"),
      readFile(new URL("../../scripts/verify.ts", import.meta.url), "utf8"),
    ]);
    expect(pkg).toContain("validate:phs3-contract");
    expect(architecture).toContain("bun run validate:phs3-contract");
    expect(verify).toContain("phs3-flute-v2-contract");
  });
});
