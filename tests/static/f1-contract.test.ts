import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateF1Contract,
  type F1ContractValidationReport,
} from "../../scripts/validate-f1-contract";

type JsonObject = Record<string, unknown>;

const sourceFixtureRoot = fileURLToPath(
  new URL("../fixtures/domain", import.meta.url),
);

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, label: string): JsonObject {
  if (!isObject(value)) throw new Error(`F1_TEST_FIXTURE_OBJECT: ${label}`);
  return value;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`F1_TEST_FIXTURE_ARRAY: ${label}`);
  return value;
}

function findingCodes(report: F1ContractValidationReport): string[] {
  return [...new Set(report.findings.map((finding) => finding.code))].sort();
}

async function readJsonObject(path: string): Promise<JsonObject> {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  return requireObject(value, path);
}

async function mutateJson(
  root: string,
  filename: string,
  mutate: (value: JsonObject) => void,
): Promise<void> {
  const path = join(root, filename);
  const value = await readJsonObject(path);
  mutate(value);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function withFixtureCopy(
  run: (root: string) => Promise<void>,
): Promise<void> {
  const parent = await mkdtemp(
    join(tmpdir(), "jcpe f1 contract mutation Ω path-"),
  );
  const root = join(parent, "copied fixture root");
  try {
    await cp(sourceFixtureRoot, root, { recursive: true });
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

async function expectRejected(
  root: string,
  ...codes: readonly string[]
): Promise<F1ContractValidationReport> {
  const report = await validateF1Contract(root);
  expect(report.outcome).toBe("fail");
  const actual = findingCodes(report);
  for (const code of codes) expect(actual).toContain(code);
  return report;
}

describe("F1 independent fixture contract", () => {
  test("accepts the complete authority set deterministically", async () => {
    const first = await validateF1Contract(sourceFixtureRoot);
    const second = await validateF1Contract(sourceFixtureRoot);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      schema: "changes.validation.f1-contract.v1",
      package: "F1",
      outcome: "pass",
      counts: {
        companions: 10,
        traces: 18,
        authorities: 8,
        seeds: 6,
      },
      findings: [],
    });
    expect(first.counts.cases).toBeGreaterThan(200);
    expect(JSON.stringify(first)).not.toContain(sourceFixtureRoot);
  });

  test("rejects a missing declared companion", async () => {
    await withFixtureCopy(async (root) => {
      await rm(join(root, "pitch-cases.json"));
      const report = await expectRejected(root, "F1_COMPANION_MISSING");
      expect(report.findings.some((finding) => finding.path === "pitch-cases.json")).toBe(true);
    });
  });

  test("rejects a duplicate case ID and its non-strict ordering", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "pitch-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "pitch cases");
        const first = requireObject(cases[0], "first pitch case");
        const second = requireObject(cases[1], "second pitch case");
        second["id"] = first["id"];
      });
      await expectRejected(root, "F1_CASE_ID_DUPLICATE", "F1_CASE_ID_ORDER");
    });
  });

  test("rejects an altered PPQ divisor inventory", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "f1-domain-contract.json", (manifest) => {
        const fixed = requireObject(manifest["fixedConstants"], "fixed constants");
        const divisors = requireArray(
          fixed["allowedBeatDenominators"],
          "allowed beat denominators",
        );
        divisors[6] = 7;
      });
      await expectRejected(root, "F1_FIXED_CONSTANT");
    });
  });

  test("rejects an orphan trace reference", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "pitch-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "pitch cases");
        const first = requireObject(cases[0], "first pitch case");
        first["traceIds"] = ["F1-TRACE-NOT-DECLARED"];
      });
      await expectRejected(root, "F1_TRACE_UNKNOWN");
    });
  });

  test("rejects an orphan authority reference", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "pitch-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "pitch cases");
        const first = requireObject(cases[0], "first pitch case");
        first["authorityIds"] = ["F1-AUTH-NOT-DECLARED"];
      });
      await expectRejected(root, "F1_AUTHORITY_UNKNOWN");
    });
  });

  test("rejects an expected issue code absent from the public domain index", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "pitch-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "pitch cases");
        const rejected = cases.find((raw) => {
          if (!isObject(raw) || !isObject(raw["expected"])) return false;
          return raw["expected"]["ok"] === false && isObject(raw["expected"]["issue"]);
        });
        const record = requireObject(rejected, "rejected pitch case");
        const expected = requireObject(record["expected"], "rejected expectation");
        const issue = requireObject(expected["issue"], "rejected issue");
        issue["code"] = "fixture.issue_code_not_exported";
      });
      await expectRejected(root, "F1_EXPECTED_ISSUE_CODE_UNKNOWN");
    });
  });

  test("rejects a weakened production-authority flag", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "f1-domain-contract.json", (manifest) => {
        const policy = requireObject(manifest["authorityPolicy"], "authority policy");
        policy["productionArtifactUsedAsAuthority"] = true;
      });
      await expectRejected(root, "F1_AUTHORITY_POLICY");
    });
  });

  test("rejects undeclared JSON and reports malformed JSON without throwing", async () => {
    await withFixtureCopy(async (root) => {
      await writeFile(join(root, "undeclared-companion.json"), "{}\n", "utf8");
      await expectRejected(root, "F1_COMPANION_UNDECLARED");

      await writeFile(join(root, "pitch-cases.json"), "{ malformed\n", "utf8");
      await expectRejected(
        root,
        "F1_COMPANION_UNDECLARED",
        "F1_CONTRACT_JSON",
      );
    });
  });
});
