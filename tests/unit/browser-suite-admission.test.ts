import { describe, expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { acquireBrowserSuite, isBrowserSuiteProcess, unrelatedBrowserSuites } from "../../scripts/browser-suite-admission";
import { PROCESS_CASES } from "../fixtures/browser-suite-admission/processes";

describe("browser suite admission identity", () => {
  for (const row of PROCESS_CASES) test(row.label, () => {
    expect(isBrowserSuiteProcess(row.argv)).toBe(row.active);
  });
  test("the old substring predicate misidentifies the independent idle-browser witness", () => {
    const witness = PROCESS_CASES[0];
    expect(witness.argv.join(" ").includes("playwright")).toBe(true);
    expect(isBrowserSuiteProcess(witness.argv)).toBe(false);
  });
  test("only the current process and its live ancestors are excluded", () => {
    const command = ["node", "/foreign/node_modules/playwright/cli.js", "test"];
    const rows = [
      { pid: 11, parentPid: 1, started: "100", argv: command },
      { pid: 12, parentPid: 11, started: "101", argv: command },
      { pid: 13, parentPid: 1, started: "102", argv: command },
      { pid: 14, parentPid: 1, started: "103", argv: ["node", "/foreign/node_modules/playwright/lib/common/process.js"] },
    ];
    expect(unrelatedBrowserSuites(rows, 12).map(row => row.pid)).toEqual([13, 14]);
    // New process with a reused number is not excluded by an old PID cache.
    expect(unrelatedBrowserSuites(rows, 99).map(row => row.pid)).toEqual([11, 12, 13, 14]);
  });
  test("reparented live worker remains active when its launcher disappears", () => {
    const orphan = { pid: 20, parentPid: 1, started: "123", argv: ["node", "/r/node_modules/playwright/lib/common/process.js"] };
    expect(unrelatedBrowserSuites([orphan], 99)).toEqual([orphan]);
  });
  test("arguments to the admission bootstrap are not an already executing CLI", () => {
    expect(isBrowserSuiteProcess(["node", "/r/test-results/browser-suite-runner-a/runner.mjs",
      "/r/node_modules/@playwright/test/cli.js", "test"])).toBe(false);
  });

  test("Bun cannot acquire the real Node browser lane", async () => {
    await rejects(acquireBrowserSuite(), /BROWSER_SUITE_NODE/u);
  });

});
