import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { validateE0V2Contract } from "../../scripts/validate-e0-v2-contract";

const fixtureRoot = new URL(
  "../fixtures/interchange-v2",
  import.meta.url,
).pathname;

type JsonObject = Record<string, unknown>;

async function withFixtureCopy(
  run: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "e0 v2 pending fixtures-"));
  await cp(fixtureRoot, root, { recursive: true });
  await run(root);
}

async function mutateJson(
  root: string,
  filename: string,
  mutate: (value: JsonObject) => void,
): Promise<void> {
  const path = join(root, filename);
  const value = JSON.parse(await readFile(path, "utf8")) as JsonObject;
  mutate(value);
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function expectRejected(
  root: string,
  ...codes: readonly string[]
): Promise<void> {
  const report = await validateE0V2Contract(root, {
    allowPendingFreeze: true,
  });
  expect(report.outcome).toBe("fail");
  for (const code of codes) {
    expect(report.findings.map(({ code: found }) => found)).toContain(code);
  }
}

describe("E0 v2 amendment packet", () => {
  test("the pending packet validates deterministically with exact counts", async () => {
    const first = await validateE0V2Contract(fixtureRoot, {
      allowPendingFreeze: true,
    });
    const second = await validateE0V2Contract(fixtureRoot, {
      allowPendingFreeze: true,
    });
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      schema: "changes.validation.e0-v2-contract.v1",
      package: "E0-v2",
      pinState: "pending-validator-freeze",
      outcome: "pass",
      counts: {
        companions: 4,
        pendingCompanions: 3,
        normalizationCases: 22,
        resolutionCases: 16,
        traces: 6,
        authorities: 5,
        pendingResolutionRows: 2,
      },
      findings: [],
    });
  });

  test("a clean resolution case cannot gain a forbidden state key", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "resolution-cases.json", (value) => {
        const cases = value["cases"] as JsonObject[];
        const positive = cases.find(
          (row) => row["id"] === "E0V2-RESCASE-005",
        ) as JsonObject;
        (positive["expectedResult"] as JsonObject)["lastKnownState"] = "x";
      });
      await expectRejected(root, "E0V2_STATE_KEY_FORBIDDEN");
    });
  });

  test("a deliberate smuggle case must materialize its forbidden key", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "resolution-cases.json", (value) => {
        const cases = value["cases"] as JsonObject[];
        const smuggle = cases.find(
          (row) => row["id"] === "E0V2-RESCASE-002",
        ) as JsonObject;
        delete (smuggle["request"] as JsonObject)["currentState"];
      });
      await expectRejected(root, "E0V2_RESCASE_SMUGGLE_MISSING");
    });
  });

  test("the groove witness must store a non-default groove id", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "resolution-cases.json", (value) => {
        const catalog = value["literalCatalog"] as JsonObject;
        const witness = catalog["candidate-groove-witness"] as JsonObject;
        const playback = (witness["value"] as JsonObject)[
          "playback"
        ] as JsonObject;
        playback["grooveStyleId"] = "ballad-comp@1";
      });
      await expectRejected(root, "E0V2_GROOVE_WITNESS");
    });
  });

  test("a refusal code outside the adopted tuples is refused", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "resolution-cases.json", (value) => {
        const cases = value["cases"] as JsonObject[];
        const positive = cases.find(
          (row) => row["id"] === "E0V2-RESCASE-010",
        ) as JsonObject;
        (positive["expectedResult"] as JsonObject)["code"] =
          "import.invented_code";
      });
      await expectRejected(root, "E0V2_RESCASE_CODE_UNKNOWN");
    });
  });

  test("the frozen gate refuses a pending packet outright", async () => {
    const report = await validateE0V2Contract(fixtureRoot);
    expect(report.outcome).toBe("fail");
    const codes = report.findings.map(({ code }) => code);
    expect(codes).toContain("E0V2_PIN_STATE");
    expect(codes).toContain("E0V2_FROZEN_PENDING");
    expect(codes).toContain("E0V2_BYTE_DIGEST");
  });

  test("independence and implementation claims are enforced", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "e0-v2-interchange-contract.json", (value) => {
        value["expectedValuesGenerated"] = true;
        value["implementationStatus"] = "implemented";
      });
      await expectRejected(
        root,
        "E0V2_INDEPENDENCE",
        "E0V2_IMPLEMENTATION_CLAIM",
      );
    });
  });

  test("a smuggled state key inside an expected result is refused", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "normalization-cases.json", (value) => {
        const cases = value["cases"] as JsonObject[];
        const target = cases[0] as JsonObject;
        (target["expected"] as JsonObject)["lastKnownState"] = "smuggled";
      });
      await expectRejected(root, "E0V2_STATE_KEY_FORBIDDEN");
    });
  });

  test("the normalization oracle is independently recomputed, not read from the fixture", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "normalization-cases.json", (value) => {
        const cases = value["cases"] as JsonObject[];
        const thrownCase = cases.find(
          (row) => row["id"] === "E0V2-NORM-006",
        ) as JsonObject;
        (thrownCase["expected"] as JsonObject)["diagnostic"] = {
          port: "prepareImportReplacementPublication",
          reason: "invalid-envelope",
          rawResultRetained: false,
        };
      });
      await expectRejected(root, "E0V2_NORM_ORACLE");
    });
  });

  test("dropping a port's thrown variant is a coverage failure", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "normalization-cases.json", (value) => {
        value["cases"] = (value["cases"] as JsonObject[]).filter(
          (row) => row["id"] !== "E0V2-NORM-017",
        );
      });
      await expectRejected(root, "E0V2_NORM_COVERAGE", "E0V2_COUNTS");
    });
  });

  test("the six-in-twenty refusal adoption relation is pinned", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "e0-v2-interchange-contract.json", (value) => {
        const adoption = value["refusalAdoption"] as JsonObject;
        adoption["v1PreparationCodesProvenMembers"] = [
          "import.confirmation_stale",
        ];
      });
      await expectRejected(root, "E0V2_REFUSAL_ADOPTION");
    });
  });

  test("a resolution row cannot silently lose both coverage and pending status", async () => {
    await withFixtureCopy(async (root) => {
      // RES-02 is carried only by the commit-surface trace; dropping it there
      // AND from the pending declaration leaves it with no evidence path.
      await mutateJson(root, "trace-ledger.json", (value) => {
        const traces = value["traces"] as JsonObject[];
        const commitSurface = traces.find(
          (row) => row["id"] === "E0V2-TRACE-COMMIT-SURFACE",
        ) as JsonObject;
        commitSurface["resolutionIds"] = (
          commitSurface["resolutionIds"] as string[]
        ).filter((id) => !id.startsWith("E0V2-RES-02"));
      });
      await mutateJson(root, "e0-v2-interchange-contract.json", (value) => {
        value["pendingResolutionCoverage"] = (
          value["pendingResolutionCoverage"] as string[]
        ).filter((id) => !id.startsWith("E0V2-RES-02"));
      });
      await expectRejected(root, "E0V2_RESOLUTION_UNCOVERED");
    });
  });

  test("every case must stay reachable from a trace", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "trace-ledger.json", (value) => {
        const traces = value["traces"] as JsonObject[];
        const normalization = traces.find(
          (row) => row["id"] === "E0V2-TRACE-NORMALIZATION",
        ) as JsonObject;
        normalization["caseIds"] = (
          normalization["caseIds"] as string[]
        ).filter((id) => id !== "E0V2-NORM-001");
      });
      await expectRejected(root, "E0V2_CASE_UNTRACED");
    });
  });
});
