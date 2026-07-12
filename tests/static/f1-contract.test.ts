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
        cases: 317,
        traces: 18,
        authorities: 9,
        seeds: 6,
      },
      findings: [],
    });
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

  test("rejects a missing Custom-plus-Auto Cartesian matrix", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "voicing-custom-cases.json", (fixture) => {
        fixture["customAutoPolicyMatrix"] = [];
      });
      await expectRejected(
        root,
        "F1_CUSTOM_AUTO_MATRIX",
        "F1_COVERAGE_COMPUTED",
      );
    });
  });

  test("rejects a weakened pairwise executable oracle", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "beat-value-cases.json", (fixture) => {
        const rows = requireArray(fixture["pairwiseClosureCases"], "pairwise rows");
        const row = requireObject(rows[0], "pairwise row");
        const oracle = requireObject(row["independentTickOracle"], "tick oracle");
        oracle["oracleVersion"] = "prose-only-v0";
      });
      await expectRejected(root, "F1_PAIRWISE_ORACLE");
    });
  });

  test("rejects a corrupted independent pitch golden", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "pitch-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "pitch cases");
        const first = requireObject(cases[0], "first pitch case");
        const expected = requireObject(first["expected"], "pitch expectation");
        expected["midi"] = 61;
      });
      await expectRejected(root, "F1_PITCH_ORACLE");
    });
  });

  test("rejects a corrupted fractional measure sum", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "meter-measure-cases.json", (fixture) => {
        const cases = requireArray(fixture["completionCases"], "completion cases");
        const fractional = requireObject(cases[18], "fractional completion case");
        const expected = requireObject(fractional["expected"], "fractional expectation");
        expected["sum"] = { numerator: 4, denominator: 2 };
      });
      await expectRejected(root, "F1_MEASURE_ORACLE");
    });
  });

  test("rejects a trace-prefix case without the required backlink", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "meter-measure-cases.json", (fixture) => {
        const cases = requireArray(fixture["completionCases"], "completion cases");
        const first = requireObject(cases[0], "first completion case");
        first["traceIds"] = ["F1-TRACE-TIME-ARITHMETIC"];
      });
      await expectRejected(
        root,
        "F1_TRACE_PREFIX_BACKLINK",
      );
    });
  });

  test("rejects stale declared coverage even when fixtures still parse", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "f1-domain-contract.json", (manifest) => {
        const summary = requireObject(manifest["coverageSummary"], "coverage summary");
        summary["fixtureCaseRecords"] = 296;
      });
      await expectRejected(root, "F1_COVERAGE_SUMMARY");
    });
  });

  test("rejects drift in a deterministic property seed", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "f1-domain-contract.json", (manifest) => {
        const determinism = requireObject(manifest["determinism"], "determinism");
        const seeds = requireArray(determinism["stableSeeds"], "stable seeds");
        const first = requireObject(seeds[0], "first seed");
        first["value"] = 1;
      });
      await expectRejected(root, "F1_SEED_INVENTORY");
    });
  });

  test("rejects a missing required authority even if the rest remain valid", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "provenance-ledger.json", (fixture) => {
        const authorities = requireArray(fixture["authorities"], "authorities");
        authorities.splice(2, 1);
      });
      await expectRejected(root, "F1_AUTHORITY_INVENTORY");
    });
  });

  test("rejects a proof kind without exact linked evidence", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "trace-ledger.json", (fixture) => {
        const traces = requireArray(fixture["traces"], "traces");
        const first = requireObject(traces[0], "first trace");
        const proofCases = requireObject(first["proofCaseIds"], "proof case map");
        delete proofCases["boundary"];
      });
      await expectRejected(root, "F1_TRACE_PROOF_MAP");
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

  test("rejects drift anywhere in reviewed case bodies, traces, or provenance", async () => {
    const mutations: ReadonlyArray<Readonly<{
      filename: string;
      mutate: (value: JsonObject) => void;
    }>> = [
      {
        filename: "chord-shape-cases.json",
        mutate: (fixture) => {
          const row = requireObject(requireArray(fixture["cases"], "chords")[0], "chord");
          requireObject(row["expected"], "expected")["degreeEqual"] = true;
        },
      },
      {
        filename: "pitch-cases.json",
        mutate: (fixture) => {
          const row = requireObject(requireArray(fixture["cases"], "pitches")[0], "pitch");
          delete row["expected"];
        },
      },
      {
        filename: "pitch-cases.json",
        mutate: (fixture) => {
          const row = requireObject(requireArray(fixture["cases"], "pitches")[0], "pitch");
          row["kind"] = "unknown-bypass-kind";
        },
      },
      {
        filename: "beat-value-cases.json",
        mutate: (fixture) => {
          const rows = requireArray(fixture["edgeCases"], "beat edges");
          const row = requireObject(rows[2], "7/7 row");
          requireObject(row["expected"], "expected")["value"] = {
            numerator: 99,
            denominator: 1,
          };
        },
      },
      {
        filename: "identity-cases.json",
        mutate: (fixture) => {
          const row = requireObject(requireArray(fixture["cases"], "ids")[0], "id row");
          requireObject(row["expected"], "expected")["sourceUnchanged"] = false;
        },
      },
      {
        filename: "document-boundary-cases.json",
        mutate: (fixture) => {
          const row = requireObject(requireArray(fixture["cases"], "documents")[0], "document");
          requireObject(row["expected"], "expected")["sectionsLength"] = 99;
        },
      },
      {
        filename: "voicing-custom-cases.json",
        mutate: (fixture) => {
          const row = requireObject(requireArray(fixture["cases"], "voicings")[0], "voicing");
          requireObject(row["expected"], "expected")["sortingApplied"] = true;
        },
      },
      {
        filename: "meter-measure-cases.json",
        mutate: (fixture) => {
          const row = requireObject(requireArray(fixture["completionCases"], "measures")[0], "measure");
          delete row["eventDurations"];
        },
      },
      {
        filename: "trace-ledger.json",
        mutate: (fixture) => {
          const trace = requireObject(requireArray(fixture["traces"], "traces")[2], "trace");
          trace["requiredCaseIds"] = ["F1-PITCH-001"];
          trace["proofKinds"] = ["positive"];
          trace["proofCaseIds"] = { positive: ["F1-PITCH-001"] };
        },
      },
      {
        filename: "provenance-ledger.json",
        mutate: (fixture) => {
          const authority = requireObject(requireArray(fixture["authorities"], "authorities")[0], "authority");
          authority["sourceRefs"] = ["bogus"];
          authority["authorityClass"] = "bogus";
          authority["covers"] = "bogus";
        },
      },
      {
        filename: "operation-state-cases.json",
        mutate: (fixture) => {
          const rows = requireArray(fixture["cases"], "operation states");
          const downstream = requireObject(rows[5], "downstream state");
          requireObject(downstream["staleRevision"], "stale revision")["applicability"] = "not-applicable";
          const bounded = requireObject(rows[0], "bounded operation");
          const expected = requireObject(bounded["expected"], "bounds");
          expected["deterministicWorkBound"] = "unbounded";
          expected["deterministicMemoryBound"] = "unbounded";
        },
      },
    ];

    await withFixtureCopy(async (root) => {
      for (const mutation of mutations) {
        await mutateJson(root, mutation.filename, mutation.mutate);
      }
      const report = await expectRejected(root, "F1_CORPUS_DIGEST");
      const expectedPaths = [...new Set(
        mutations.map((mutation) => mutation.filename),
      )].sort();
      const actualPaths = report.findings
        .filter((finding) => finding.code === "F1_CORPUS_DIGEST")
        .map((finding) => finding.path)
        .sort();
      expect(actualPaths).toEqual(expectedPaths);
    });
  });

  test("rejects duplicate JSON keys through the reviewed byte digest", async () => {
    await withFixtureCopy(async (root) => {
      const path = join(root, "pitch-cases.json");
      const source = await readFile(path, "utf8");
      await writeFile(
        path,
        source.replace(
          /^\{/,
          '{\n  "schema": "changes.fixtures.f1-pitch.v1",',
        ),
        "utf8",
      );
      await expectRejected(root, "F1_CORPUS_DIGEST");
    });
  });

  test("sanitizes invalid fixture-root filesystem errors", async () => {
    await withFixtureCopy(async (root) => {
      const invalidRoot = join(root, "pitch-cases.json");
      const report = await validateF1Contract(invalidRoot);
      expect(report.outcome).toBe("fail");
      expect(JSON.stringify(report)).not.toContain(root);
    });
  });
});
