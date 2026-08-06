import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  PHYSICAL_CACHE_IDENTITY_FIELDS,
  PHYSICAL_INSTRUMENT_FAMILIES,
  PHYSICAL_RENDER_ABI_VERSION,
  PHYSICAL_RENDER_LIMITS,
  PHYSICAL_RENDER_MODES,
  PHYSICAL_RENDER_PLAN_SCHEMA,
  PHYSICAL_RENDER_REFUSAL_CODES,
  PHYSICAL_RENDER_VALIDATION_ORDER,
  type ExpressiveRealizationPlan,
  type PhysicalRenderAbiReceiptV2,
  type PhysicalRenderAbiRequestV2,
  type PhysicalRenderPlan,
  type PhysicalRenderResult,
} from "../../src/audio";
import { validatePhs0Contract } from "../../scripts/validate-phs0-contract";

type JsonProperty =
  | "cacheIdentityFields"
  | "controls"
  | "expectedFindingCode"
  | "id"
  | "instrumentFamilies"
  | "limits"
  | "pointer"
  | "renderModes"
  | "target"
  | "validationOrder"
  | "value";
type JsonObject = Record<string, unknown> &
  Partial<Record<JsonProperty, unknown>>;
type Assert<Value extends true> = Value;
type Equal<Left, Right> =
  [Left] extends [Right]
    ? [Right] extends [Left]
      ? true
      : false
    : false;

const typeAssertions: readonly [
  Assert<Equal<ExpressiveRealizationPlan["schema"], "changes.audio.expressive-realization-plan.v1">>,
  Assert<Equal<PhysicalRenderPlan["schema"], "changes.audio.physical-render-plan.v1">>,
  Assert<Equal<PhysicalRenderAbiRequestV2["abiVersion"], 2>>,
  Assert<Equal<PhysicalRenderAbiReceiptV2["status"], "completed" | "refused">>,
  Assert<Equal<Extract<PhysicalRenderResult<"ok">, { ok: true }>["value"], "ok">>,
] = [true, true, true, true, true];
void typeAssertions;

const fixtureRoot = new URL("../fixtures/physical-renderer", import.meta.url).pathname;
const architecturePath = new URL("../../docs/ARCHITECTURE.md", import.meta.url).pathname;
const packagePath = new URL("../../package.json", import.meta.url).pathname;
const verifyPath = new URL("../../scripts/verify.ts", import.meta.url).pathname;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodePointerSegment(value: string): string {
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function replacePointer(root: JsonObject, pointer: string, value: unknown): void {
  const segments = pointer.slice(1).split("/").map(decodePointerSegment);
  let current: unknown = root;
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(current)) current = current[Number(segment)];
    else if (isObject(current)) current = current[segment];
    else throw new Error(`PHS0_TEST_POINTER_PARENT: ${pointer}`);
  }
  const last = segments.at(-1);
  if (last === undefined) throw new Error(`PHS0_TEST_POINTER_EMPTY: ${pointer}`);
  if (Array.isArray(current)) current[Number(last)] = value;
  else if (isObject(current)) current[last] = value;
  else throw new Error(`PHS0_TEST_POINTER_TARGET: ${pointer}`);
}

async function readObject(path: string): Promise<JsonObject> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isObject(parsed)) throw new Error(`PHS0_TEST_JSON_OBJECT: ${path}`);
  return parsed;
}

describe("PHS0 physical renderer contract", () => {
  test("the independent packet validates with reviewed counts", async () => {
    const report = await validatePhs0Contract();
    expect(report).toEqual({
      schema: "changes.validation.phs0-contract.v1",
      package: "PHS0",
      outcome: "pass",
      counts: {
        abiCases: 8,
        baselineRenderedRecipes: 7,
        gestureCases: 12,
        mutationControls: 16,
        partitionCases: 10,
        authorities: 8,
        traces: 18,
      },
      findings: [],
    });
  });

  test("typed constants exactly match the independent packet", async () => {
    const contract = await readObject(join(fixtureRoot, "phs0-contract.json"));
    expect(PHYSICAL_RENDER_ABI_VERSION).toBe(2);
    expect(PHYSICAL_RENDER_PLAN_SCHEMA).toBe("changes.audio.physical-render-plan.v1");
    expect(contract.renderModes).toEqual(PHYSICAL_RENDER_MODES);
    expect(contract.instrumentFamilies).toEqual(PHYSICAL_INSTRUMENT_FAMILIES);
    expect(contract.limits).toEqual(PHYSICAL_RENDER_LIMITS);
    expect(contract.cacheIdentityFields).toEqual(PHYSICAL_CACHE_IDENTITY_FIELDS);
    expect(contract.validationOrder).toEqual(PHYSICAL_RENDER_VALIDATION_ORDER);
    expect(PHYSICAL_RENDER_REFUSAL_CODES).toContain("physical.nonlinear_solve_nonconvergent");
    expect(PHYSICAL_RENDER_REFUSAL_CODES).toContain("limit.physical_scratch_exceeded");
  });

  test("all authored mutation controls produce their named finding", async () => {
    const mutationFile = await readObject(join(fixtureRoot, "mutation-controls.json"));
    const controls = mutationFile.controls;
    if (!Array.isArray(controls)) throw new Error("PHS0_TEST_MUTATIONS_ARRAY");
    for (const raw of controls) {
      if (!isObject(raw)) throw new Error("PHS0_TEST_MUTATION_OBJECT");
      const target = raw.target;
      const pointer = raw.pointer;
      const expected = raw.expectedFindingCode;
      if (typeof target !== "string" || typeof pointer !== "string" || typeof expected !== "string") {
        throw new Error("PHS0_TEST_MUTATION_SHAPE");
      }
      const temporary = await mkdtemp(join(tmpdir(), "phs0-contract-"));
      try {
        await cp(fixtureRoot, temporary, { recursive: true });
        const targetPath = join(temporary, target);
        const document = await readObject(targetPath);
        replacePointer(document, pointer, raw.value);
        await writeFile(targetPath, `${JSON.stringify(document, null, 2)}\n`);
        const report = await validatePhs0Contract(temporary);
        expect(report.outcome, String(raw.id)).toBe("fail");
        expect(report.findings.map((finding) => finding.code), String(raw.id)).toContain(expected);
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    }
  });

  test("the public validation command and aggregate gate are registered", async () => {
    const [architecture, packageJson, verify] = await Promise.all([
      readFile(architecturePath, "utf8"),
      readFile(packagePath, "utf8"),
      readFile(verifyPath, "utf8"),
    ]);
    expect(architecture).toContain("bun run validate:phs0-contract");
    expect(packageJson).toContain('"validate:phs0-contract": "bun scripts/validate-phs0-contract.ts"');
    expect(verify).toContain('id: "phs0-physical-renderer-contract"');
  });
});
