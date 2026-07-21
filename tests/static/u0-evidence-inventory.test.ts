import { describe, expect, test } from "bun:test";

import {
  compareU0BrowserCellInventory,
  compareU0BunJUnitInventory,
  compareU0PlaywrightInventory,
  expectedU0BrowserCells,
  expectedU0BunCases,
  expectedU0PlaywrightTests,
  loadU0EvidenceInventory,
  verifyU0EvidenceInventorySourceHashes,
  type U0BrowserCellIdentity,
  type U0EvidenceInventory,
  type U0PlaywrightIdentity,
} from "../../scripts/u0-evidence-inventory";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function reviewedInventory(): Promise<U0EvidenceInventory> {
  const result = await loadU0EvidenceInventory();
  expect(result.findings).toEqual([]);
  expect(result.inventory).not.toBeNull();
  if (result.inventory === null) {
    throw new Error("U0_EVIDENCE_INVENTORY_TEST_FIXTURE_INVALID");
  }
  return result.inventory;
}

function playwrightReport(
  identities: readonly U0PlaywrightIdentity[],
): JsonRecord {
  const files = new Map<string, Map<string, string[]>>();
  for (const identity of identities) {
    const titles = files.get(identity.file) ?? new Map<string, string[]>();
    const projects = titles.get(identity.title) ?? [];
    projects.push(identity.project);
    titles.set(identity.title, projects);
    files.set(identity.file, titles);
  }
  return {
    suites: [...files].map(([file, titles]) => ({
      file,
      specs: [...titles].map(([title, projects]) => ({
        file,
        title,
        tests: projects.map((projectName) => ({ projectName })),
      })),
      suites: [],
    })),
  };
}

function browserCell(value: U0BrowserCellIdentity): JsonRecord {
  return {
    bindings: value.bindings.map(({ caseId, traceIds }) => ({
      caseId,
      traceIds: [...traceIds],
    })),
    browser: { name: value.project },
    cellId: value.cellId,
    producer: { ...value.producer },
    screenshots: value.screenshots.map((filename) => ({ filename })),
  };
}

function codes(findings: readonly Readonly<{ code: string }>[]): string[] {
  return findings.map(({ code }) => code);
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(label);
  return value;
}

describe("U0 independently reviewed evidence inventory", () => {
  test("loads the exact current inventories and verifies every reviewed source hash", async () => {
    const inventory = await reviewedInventory();
    expect(expectedU0BunCases(inventory)).toHaveLength(117);
    expect(expectedU0PlaywrightTests(inventory)).toHaveLength(90);
    expect(expectedU0BrowserCells(inventory)).toHaveLength(84);
    expect(await verifyU0EvidenceInventorySourceHashes(inventory)).toEqual([]);
  });

  test("accepts exact Bun, Playwright, cell, binding, and screenshot identities", async () => {
    const inventory = await reviewedInventory();
    const bunCases = expectedU0BunCases(inventory).map(({ file, title }) => ({
      file,
      name: title,
    }));
    const playwrightTests = expectedU0PlaywrightTests(inventory);
    const cells = expectedU0BrowserCells(inventory).map(browserCell);

    expect(compareU0BunJUnitInventory(inventory, bunCases)).toEqual([]);
    expect(
      compareU0PlaywrightInventory(
        inventory,
        playwrightReport(playwrightTests),
      ),
    ).toEqual([]);
    expect(compareU0BrowserCellInventory(inventory, cells)).toEqual([]);
  });

  test("rejects reduced, renamed, duplicate, and extra Bun testcase identities", async () => {
    const inventory = await reviewedInventory();
    const exact = expectedU0BunCases(inventory).map(({ file, title }) => ({
      file,
      name: title,
    }));
    const first = required(
      exact[0],
      "U0_EVIDENCE_INVENTORY_TEST_BUN_CASE_MISSING",
    );

    expect(codes(compareU0BunJUnitInventory(inventory, exact.slice(1))))
      .toContain("U0_EVIDENCE_INVENTORY_BUN_MISSING");
    const renamed = codes(compareU0BunJUnitInventory(inventory, [
      { ...first, name: `${first.name} renamed` },
      ...exact.slice(1),
    ]));
    expect(renamed).toContain("U0_EVIDENCE_INVENTORY_BUN_MISSING");
    expect(renamed).toContain("U0_EVIDENCE_INVENTORY_BUN_EXTRA");
    expect(codes(compareU0BunJUnitInventory(inventory, [
      ...exact,
      first,
    ]))).toContain("U0_EVIDENCE_INVENTORY_BUN_DUPLICATE");
    expect(codes(compareU0BunJUnitInventory(inventory, [
      ...exact,
      { file: "tests/static/unreviewed.test.ts", name: "unreviewed test" },
    ]))).toContain("U0_EVIDENCE_INVENTORY_BUN_EXTRA");
  });

  test("rejects reduced, renamed, duplicate, and extra Playwright identities", async () => {
    const inventory = await reviewedInventory();
    const exact = expectedU0PlaywrightTests(inventory);
    const first = required(
      exact[0],
      "U0_EVIDENCE_INVENTORY_TEST_PLAYWRIGHT_CASE_MISSING",
    );

    expect(codes(compareU0PlaywrightInventory(
      inventory,
      playwrightReport(exact.slice(1)),
    ))).toContain("U0_EVIDENCE_INVENTORY_PLAYWRIGHT_MISSING");
    const renamed = codes(compareU0PlaywrightInventory(
      inventory,
      playwrightReport([
        { ...first, title: `${first.title} renamed` },
        ...exact.slice(1),
      ]),
    ));
    expect(renamed).toContain("U0_EVIDENCE_INVENTORY_PLAYWRIGHT_MISSING");
    expect(renamed).toContain("U0_EVIDENCE_INVENTORY_PLAYWRIGHT_EXTRA");
    expect(codes(compareU0PlaywrightInventory(
      inventory,
      playwrightReport([...exact, first]),
    ))).toContain("U0_EVIDENCE_INVENTORY_PLAYWRIGHT_DUPLICATE");
    expect(codes(compareU0PlaywrightInventory(
      inventory,
      playwrightReport([
        ...exact,
        {
          file: "tests/e2e/unreviewed.spec.ts",
          project: "chromium",
          title: "unreviewed browser test",
        },
      ]),
    ))).toContain("U0_EVIDENCE_INVENTORY_PLAYWRIGHT_EXTRA");
  });

  test("rejects cell identity, producer, binding, and screenshot inventory drift", async () => {
    const inventory = await reviewedInventory();
    const expected = expectedU0BrowserCells(inventory);
    const exact = expected.map(browserCell);
    const screenshotIndex = expected.findIndex(
      ({ screenshots }) => screenshots.length > 0,
    );
    expect(screenshotIndex).toBeGreaterThanOrEqual(0);
    if (screenshotIndex < 0) {
      throw new Error("U0_EVIDENCE_INVENTORY_TEST_SCREENSHOT_CELL_MISSING");
    }
    const firstCell = required(
      exact[0],
      "U0_EVIDENCE_INVENTORY_TEST_CELL_MISSING",
    );

    expect(codes(compareU0BrowserCellInventory(inventory, exact.slice(1))))
      .toContain("U0_EVIDENCE_INVENTORY_CELL_MISSING");

    const renamedProducer = structuredClone(exact);
    const producer = required(
      renamedProducer[0],
      "U0_EVIDENCE_INVENTORY_TEST_CELL_MISSING",
    )["producer"];
    if (!isRecord(producer)) {
      throw new Error("U0_EVIDENCE_INVENTORY_TEST_PRODUCER_MISSING");
    }
    producer["title"] = `${String(producer["title"])} renamed`;
    const producerFindings = codes(
      compareU0BrowserCellInventory(inventory, renamedProducer),
    );
    expect(producerFindings).toContain("U0_EVIDENCE_INVENTORY_CELL_MISSING");
    expect(producerFindings).toContain("U0_EVIDENCE_INVENTORY_CELL_EXTRA");

    const changedBindings = structuredClone(exact);
    required(
      changedBindings[0],
      "U0_EVIDENCE_INVENTORY_TEST_CELL_MISSING",
    )["bindings"] = [{
      caseId: "U0-UNREVIEWED-001",
      traceIds: ["TR-U0-AXE"],
    }];
    expect(codes(compareU0BrowserCellInventory(inventory, changedBindings)))
      .toContain("U0_EVIDENCE_INVENTORY_CELL_BINDINGS");

    const changedScreenshots = structuredClone(exact);
    required(
      changedScreenshots[screenshotIndex],
      "U0_EVIDENCE_INVENTORY_TEST_SCREENSHOT_CELL_MISSING",
    )["screenshots"] = [{
      filename: "renamed-screenshot.png",
    }];
    expect(codes(compareU0BrowserCellInventory(inventory, changedScreenshots)))
      .toContain("U0_EVIDENCE_INVENTORY_CELL_SCREENSHOTS");

    const extra = structuredClone(firstCell);
    extra["cellId"] = "unreviewed-cell";
    expect(codes(compareU0BrowserCellInventory(inventory, [...exact, extra])))
      .toContain("U0_EVIDENCE_INVENTORY_CELL_EXTRA");
  });
});
