import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { atomicWrite, sha256Hex, stableJson } from "./foundation-io";
import { inspectToolchain } from "./toolchain-doctor";
import { verifyLicenses } from "./verify-licenses";
import { verifyStandalone } from "./verify-standalone";

type JsonRecord = Record<string, unknown>;
type Outcome = "pass" | "fail";
type ValidationKind =
  | "artifact"
  | "browser"
  | "licenses"
  | "negative-control"
  | "toolchain";

type FoundationContract = {
  schemaVersion: number;
  contractId: string;
  artifact: {
    canonicalOutput: string;
    browserEvidence: string;
  };
  toolchain: {
    packageManager: string;
    runtimeDependencies: Record<string, string>;
    developmentDependencies: Record<string, string>;
  };
  browserModes: Array<{ id: string }>;
  browserProjects: string[];
  traceability: Array<{ id: string; kind: string }>;
  verificationLogFields: string[];
};

type TraceDescriptor = {
  commands: string[][];
  evidencePaths: string[];
  validations: ValidationKind[];
};

export type F0EvidenceFinding = {
  code: string;
  message: string;
  path: string;
  traceId: string | null;
};

export type F0TraceEvidence = {
  traceId: string;
  kind: string;
  commands: string[][];
  evidencePaths: string[];
  seed: string | null;
  outcome: Outcome;
  findings: F0EvidenceFinding[];
};

export type F0EvidenceLedger = {
  schemaVersion: 1;
  contractId: "F0";
  traceId: "F0";
  toolVersion: "jcpe.verify-f0-evidence.v1";
  browserVersion: Array<{ browser: string; version: string }>;
  artifactHash: string;
  artifactBytes: number;
  mode: "aggregate";
  seed: string;
  outcome: Outcome;
  findings: F0EvidenceFinding[];
  versions: Array<{ name: string; version: string }>;
  seeds: Array<{ scope: string; value: string }>;
  licenseCounts: { packages: number; assets: number };
  browserRun: {
    runId: string;
    expectedCells: string[];
    observedCells: string[];
    evidenceDirectory: string;
  };
  traces: F0TraceEvidence[];
};

type CheckResult = {
  findings: Array<Omit<F0EvidenceFinding, "traceId">>;
};

type ArtifactIdentity = {
  hash: string;
  bytes: number;
};

type BrowserSummary = {
  findings: Array<Omit<F0EvidenceFinding, "traceId">>;
  runId: string;
  seed: string;
  expectedCells: string[];
  observedCells: string[];
  evidenceDirectory: string;
  browserVersions: Array<{ browser: string; version: string }>;
  playwrightVersion: string;
};

const outputPath = "test-results/f0-evidence-ledger.json";

const traceDescriptors: Record<string, TraceDescriptor> = {
  "F0-ARTIFACT-01": {
    commands: [
      ["bun", "run", "build"],
      ["bun", "scripts/verify-standalone.ts", "--static-only"],
      ["bun", "test", "tests/static/standalone-staleness.test.ts"],
    ],
    evidencePaths: [
      "dist/index.html",
      "dist/standalone-manifest.json",
      "jazz_chord_progression_editor.html",
      "scripts/verify-standalone.ts",
      "tests/static/standalone-staleness.test.ts",
    ],
    validations: ["artifact"],
  },
  "F0-BOUNDARY-01": {
    commands: [["bun", "test", "tests/static/dependency-boundaries.test.ts"]],
    evidencePaths: [
      "scripts/source-policy.ts",
      "tests/fixtures/foundation/static-cases.json",
      "tests/static/dependency-boundaries.test.ts",
    ],
    validations: [],
  },
  "F0-CSP-01": {
    commands: [
      ["bun", "test", "tests/static/artifact-policy.test.ts"],
      [
        "bun",
        "scripts/run-playwright.ts",
        "test",
        "tests/e2e/offline-harness.spec.ts",
      ],
    ],
    evidencePaths: [
      "dist/standalone-manifest.json",
      "test-results/playwright-results.json",
      "tests/e2e/offline-harness.spec.ts",
      "tests/static/artifact-policy.test.ts",
    ],
    validations: ["artifact", "negative-control"],
  },
  "F0-DUPLICATE-01": {
    commands: [["bun", "test", "tests/static/no-duplicate-members.test.ts"]],
    evidencePaths: [
      "tests/fixtures/foundation/static-cases.json",
      "tests/static/no-duplicate-members.test.ts",
    ],
    validations: [],
  },
  "F0-LICENSE-01": {
    commands: [["bun", "scripts/verify-licenses.ts"]],
    evidencePaths: [
      "dist/licenses.json",
      "scripts/verify-licenses.ts",
      "tests/fixtures/foundation/toolchain-ledger.json",
    ],
    validations: ["licenses"],
  },
  "F0-NETWORK-01": {
    commands: [
      [
        "bun",
        "scripts/run-playwright.ts",
        "test",
        "tests/e2e/standalone-offline.spec.ts",
      ],
      ["bun", "test", "tests/static/browser-evidence.test.ts"],
    ],
    evidencePaths: [
      "test-results/standalone-browser-evidence.json",
      "tests/e2e/standalone-offline.spec.ts",
      "tests/static/browser-evidence.test.ts",
    ],
    validations: ["browser"],
  },
  "F0-NETWORK-02": {
    commands: [
      [
        "bun",
        "scripts/run-playwright.ts",
        "test",
        "tests/e2e/offline-harness.spec.ts",
      ],
    ],
    evidencePaths: [
      "test-results/playwright-results.json",
      "tests/e2e/offline-harness.spec.ts",
    ],
    validations: ["negative-control"],
  },
  "F0-NODE-01": {
    commands: [["bun", "scripts/toolchain-doctor.ts"]],
    evidencePaths: [
      "package.json",
      "scripts/toolchain-doctor.ts",
      "tests/fixtures/foundation/toolchain-ledger.json",
    ],
    validations: ["toolchain"],
  },
  "F0-REPRO-01": {
    commands: [
      ["bun", "scripts/verify-reproducible.ts"],
      ["bun", "test", "tests/static/standalone-staleness.test.ts"],
    ],
    evidencePaths: [
      "dist/standalone-manifest.json",
      "scripts/verify-reproducible.ts",
      "tests/static/standalone-staleness.test.ts",
    ],
    validations: ["artifact"],
  },
  "F0-SIZE-01": {
    commands: [["bun", "test", "tests/static/artifact-policy.test.ts"]],
    evidencePaths: [
      "dist/standalone-manifest.json",
      "tests/fixtures/foundation/static-cases.json",
      "tests/static/artifact-policy.test.ts",
    ],
    validations: ["artifact"],
  },
  "F0-TOOLCHAIN-01": {
    commands: [["bun", "scripts/toolchain-doctor.ts"]],
    evidencePaths: [
      "bun.lock",
      "package.json",
      "scripts/toolchain-doctor.ts",
      "tests/fixtures/foundation/toolchain-ledger.json",
    ],
    validations: ["toolchain"],
  },
  "L-OFFLINE-01": {
    commands: [
      [
        "bun",
        "scripts/run-playwright.ts",
        "test",
        "tests/e2e/standalone-offline.spec.ts",
      ],
    ],
    evidencePaths: [
      "test-results/standalone-browser-evidence.json",
      "tests/e2e/standalone-offline.spec.ts",
    ],
    validations: ["browser"],
  },
  "L-SOURCE-01": {
    commands: [["bun", "test", "tests/static/no-duplicate-members.test.ts"]],
    evidencePaths: [
      "tests/fixtures/foundation/static-cases.json",
      "tests/static/no-duplicate-members.test.ts",
    ],
    validations: [],
  },
};

const negativeControlTitles = [
  "runtime-negative-bad-response is detected without relying on CSP",
  "runtime-negative-console-error is detected without relying on CSP",
  "runtime-negative-external-request is detected without relying on CSP",
  "runtime-negative-page-error is detected without relying on CSP",
  "runtime-negative-popup is detected without relying on CSP",
  "runtime-negative-sidecar is detected without relying on CSP",
  "runtime-negative-websocket is detected without relying on CSP",
  "runtime-negative-worker is detected without relying on CSP",
];

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function findingKey(finding: F0EvidenceFinding): string {
  return [finding.traceId ?? "", finding.code, finding.path, finding.message].join(":");
}

function sortFindings(findings: F0EvidenceFinding[]): F0EvidenceFinding[] {
  return findings.sort((left, right) => compare(findingKey(left), findingKey(right)));
}

function checkFinding(
  code: string,
  path: string,
  message: string,
): Omit<F0EvidenceFinding, "traceId"> {
  return { code, path, message };
}

async function readJson(path: string): Promise<unknown> {
  return Bun.file(path).json() as Promise<unknown>;
}

async function inspectArtifactIdentity(
  contract: FoundationContract,
): Promise<{ identity: ArtifactIdentity; check: CheckResult }> {
  const findings: CheckResult["findings"] = [];
  let identity: ArtifactIdentity = { hash: "unavailable", bytes: 0 };
  try {
    const bytes = new Uint8Array(
      await Bun.file(contract.artifact.canonicalOutput).arrayBuffer(),
    );
    identity = { hash: await sha256Hex(bytes), bytes: bytes.byteLength };
    const verified = await verifyStandalone();
    if (verified.sha256 !== identity.hash || verified.bytes !== identity.bytes) {
      findings.push(
        checkFinding(
          "F0_EVIDENCE_ARTIFACT_IDENTITY",
          contract.artifact.canonicalOutput,
          "The standalone verifier returned a different artifact hash or byte count.",
        ),
      );
    }
  } catch (error) {
    findings.push(
      checkFinding(
        "F0_EVIDENCE_ARTIFACT",
        contract.artifact.canonicalOutput,
        error instanceof Error ? error.message : "Artifact verification failed.",
      ),
    );
  }
  return { identity, check: { findings } };
}

function requiredFieldsMissing(
  record: JsonRecord,
  required: readonly string[],
): string[] {
  return required.filter((field) => !(field in record));
}

async function inspectBrowserEvidence(
  contract: FoundationContract,
  artifact: ArtifactIdentity,
): Promise<BrowserSummary> {
  const findings: BrowserSummary["findings"] = [];
  const expectedCells = contract.browserProjects
    .flatMap((browser) =>
      contract.browserModes.map((mode) => `${browser}:${mode.id}`),
    )
    .sort(compare);
  const summary: BrowserSummary = {
    findings,
    runId: "unavailable",
    seed: "unavailable",
    expectedCells,
    observedCells: [],
    evidenceDirectory: "unavailable",
    browserVersions: [],
    playwrightVersion: "unavailable",
  };

  let report: unknown;
  try {
    report = await readJson(contract.artifact.browserEvidence);
  } catch (error) {
    findings.push(
      checkFinding(
        "F0_EVIDENCE_BROWSER_REPORT",
        contract.artifact.browserEvidence,
        error instanceof Error ? error.message : "Browser evidence is unreadable.",
      ),
    );
    return summary;
  }
  if (!isRecord(report)) {
    findings.push(
      checkFinding(
        "F0_EVIDENCE_BROWSER_SHAPE",
        contract.artifact.browserEvidence,
        "Browser evidence must be a JSON object.",
      ),
    );
    return summary;
  }

  summary.runId = typeof report["runId"] === "string" ? report["runId"] : "unavailable";
  summary.seed = typeof report["seed"] === "string" ? report["seed"] : "unavailable";
  summary.playwrightVersion =
    typeof report["toolVersion"] === "string" ? report["toolVersion"] : "unavailable";
  summary.evidenceDirectory =
    summary.runId === "unavailable"
      ? "unavailable"
      : `test-results/standalone-browser-evidence-runs/${summary.runId}`;

  const topMissing = requiredFieldsMissing(report, contract.verificationLogFields);
  if (topMissing.length > 0) {
    findings.push(
      checkFinding(
        "F0_EVIDENCE_BROWSER_FIELDS",
        contract.artifact.browserEvidence,
        `The matrix report is missing: ${topMissing.join(", ")}.`,
      ),
    );
  }
  if (
    report["schemaVersion"] !== 1 ||
    report["traceId"] !== "F0-NETWORK-01" ||
    report["mode"] !== "matrix" ||
    report["outcome"] !== "pass"
  ) {
    findings.push(
      checkFinding(
        "F0_EVIDENCE_BROWSER_IDENTITY",
        contract.artifact.browserEvidence,
        "The browser matrix schema, trace, mode, or outcome is not passing F0 evidence.",
      ),
    );
  }
  if (
    report["artifactHash"] !== artifact.hash ||
    report["artifactBytes"] !== artifact.bytes
  ) {
    findings.push(
      checkFinding(
        "F0_EVIDENCE_BROWSER_STALE",
        contract.artifact.browserEvidence,
        "Browser evidence does not match the current artifact hash and byte count.",
      ),
    );
  }
  if (!Array.isArray(report["findings"]) || report["findings"].length !== 0) {
    findings.push(
      checkFinding(
        "F0_EVIDENCE_BROWSER_FINDINGS",
        contract.artifact.browserEvidence,
        "A passing browser matrix must contain zero findings.",
      ),
    );
  }
  const declaredCells = Array.isArray(report["expectedCells"])
    ? report["expectedCells"].filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  if (JSON.stringify(declaredCells) !== JSON.stringify(expectedCells)) {
    findings.push(
      checkFinding(
        "F0_EVIDENCE_BROWSER_MATRIX",
        `${contract.artifact.browserEvidence}#expectedCells`,
        "The declared browser matrix does not exactly match the contract.",
      ),
    );
  }

  const cells = Array.isArray(report["cells"]) ? report["cells"] : [];
  const counts = new Map<string, number>();
  const versions = new Map<string, Set<string>>();
  for (const [index, value] of cells.entries()) {
    const path = `${contract.artifact.browserEvidence}#cells[${String(index)}]`;
    if (!isRecord(value)) {
      findings.push(
        checkFinding("F0_EVIDENCE_BROWSER_CELL", path, "Cell must be a JSON object."),
      );
      continue;
    }
    const browser = typeof value["browser"] === "string" ? value["browser"] : "";
    const mode = typeof value["mode"] === "string" ? value["mode"] : "";
    const key = `${browser}:${mode}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const missing = requiredFieldsMissing(value, contract.verificationLogFields);
    if (missing.length > 0) {
      findings.push(
        checkFinding(
          "F0_EVIDENCE_BROWSER_FIELDS",
          path,
          `Cell is missing: ${missing.join(", ")}.`,
        ),
      );
    }
    if (
      value["schemaVersion"] !== 1 ||
      value["traceId"] !== "F0-NETWORK-01" ||
      value["runId"] !== summary.runId ||
      value["seed"] !== summary.seed ||
      value["toolVersion"] !== summary.playwrightVersion
    ) {
      findings.push(
        checkFinding(
          "F0_EVIDENCE_BROWSER_CELL_IDENTITY",
          path,
          "Cell schema, trace, run, seed, or tool version differs from its matrix.",
        ),
      );
    }
    if (
      value["artifactHash"] !== artifact.hash ||
      value["artifactBytes"] !== artifact.bytes
    ) {
      findings.push(
        checkFinding(
          "F0_EVIDENCE_BROWSER_CELL_STALE",
          path,
          "Cell does not match the current artifact hash and byte count.",
        ),
      );
    }
    const assertions = value["assertions"];
    if (
      !isRecord(assertions) ||
      Object.keys(assertions).length === 0 ||
      Object.values(assertions).some((outcome) => outcome !== "pass")
    ) {
      findings.push(
        checkFinding(
          "F0_EVIDENCE_BROWSER_ASSERTION",
          path,
          "Every named browser assertion must be present and pass.",
        ),
      );
    }
    if (
      value["outcome"] !== "pass" ||
      !Array.isArray(value["findings"]) ||
      value["findings"].length !== 0
    ) {
      findings.push(
        checkFinding(
          "F0_EVIDENCE_BROWSER_CELL_FAILED",
          path,
          "Every matrix cell must pass with zero findings.",
        ),
      );
    }
    const browserVersion = value["browserVersion"];
    if (browser.length > 0 && typeof browserVersion === "string" && browserVersion.length > 0) {
      const browserSet = versions.get(browser) ?? new Set<string>();
      browserSet.add(browserVersion);
      versions.set(browser, browserSet);
    } else {
      findings.push(
        checkFinding(
          "F0_EVIDENCE_BROWSER_VERSION",
          path,
          "Cell browser name and version must be non-empty strings.",
        ),
      );
    }
  }

  summary.observedCells = [...counts.keys()].sort(compare);
  for (const expected of expectedCells) {
    const count = counts.get(expected) ?? 0;
    if (count !== 1) {
      findings.push(
        checkFinding(
          count === 0
            ? "F0_EVIDENCE_BROWSER_CELL_MISSING"
            : "F0_EVIDENCE_BROWSER_CELL_DUPLICATE",
          contract.artifact.browserEvidence,
          `Expected exactly one ${expected} cell; found ${String(count)}.`,
        ),
      );
    }
  }
  for (const key of counts.keys()) {
    if (!expectedCells.includes(key)) {
      findings.push(
        checkFinding(
          "F0_EVIDENCE_BROWSER_CELL_UNEXPECTED",
          contract.artifact.browserEvidence,
          `Unexpected browser matrix cell: ${key}.`,
        ),
      );
    }
  }
  if (cells.length !== expectedCells.length) {
    findings.push(
      checkFinding(
        "F0_EVIDENCE_BROWSER_CELL_COUNT",
        contract.artifact.browserEvidence,
        `Expected ${String(expectedCells.length)} cells; found ${String(cells.length)}.`,
      ),
    );
  }

  summary.browserVersions = [...versions]
    .sort(([left], [right]) => compare(left, right))
    .flatMap(([browser, values]) => {
      const found = [...values].sort(compare);
      if (found.length !== 1) {
        findings.push(
          checkFinding(
            "F0_EVIDENCE_BROWSER_VERSION",
            contract.artifact.browserEvidence,
            `${browser} cells must report one consistent browser version.`,
          ),
        );
      }
      return found.map((version) => ({ browser, version }));
    });

  if (summary.runId !== "unavailable") {
    try {
      const rawFiles = (await readdir(summary.evidenceDirectory))
        .filter((name) => name.endsWith(".json"))
        .sort(compare);
      if (rawFiles.length !== expectedCells.length) {
        findings.push(
          checkFinding(
            "F0_EVIDENCE_BROWSER_RAW_COUNT",
            summary.evidenceDirectory,
            `Current run must contain exactly ${String(expectedCells.length)} raw cells; found ${String(rawFiles.length)}.`,
          ),
        );
      }
    } catch (error) {
      findings.push(
        checkFinding(
          "F0_EVIDENCE_BROWSER_RAW_RUN",
          summary.evidenceDirectory,
          error instanceof Error ? error.message : "Current raw browser run is unreadable.",
        ),
      );
    }
  }

  return summary;
}

type PlaywrightTest = {
  title: string;
  browser: string;
  passed: boolean;
};

function collectPlaywrightTests(value: unknown, output: PlaywrightTest[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectPlaywrightTests(item, output);
    return;
  }
  if (!isRecord(value)) return;
  if (typeof value["title"] === "string" && Array.isArray(value["tests"])) {
    for (const test of value["tests"]) {
      if (!isRecord(test)) continue;
      const browser = test["projectName"];
      const results = test["results"];
      output.push({
        title: value["title"],
        browser: typeof browser === "string" ? browser : "",
        passed:
          test["status"] === "expected" &&
          Array.isArray(results) &&
          results.length === 1 &&
          isRecord(results[0]) &&
          results[0]["status"] === "passed",
      });
    }
  }
  for (const child of Object.values(value)) collectPlaywrightTests(child, output);
}

async function inspectNegativeControls(
  contract: FoundationContract,
): Promise<CheckResult> {
  const findings: CheckResult["findings"] = [];
  const path = "test-results/playwright-results.json";
  let report: unknown;
  try {
    report = await readJson(path);
  } catch (error) {
    findings.push(
      checkFinding(
        "F0_EVIDENCE_PLAYWRIGHT_REPORT",
        path,
        error instanceof Error ? error.message : "Playwright report is unreadable.",
      ),
    );
    return { findings };
  }
  const tests: PlaywrightTest[] = [];
  collectPlaywrightTests(report, tests);
  for (const title of negativeControlTitles) {
    for (const browser of contract.browserProjects) {
      const matches = tests.filter(
        (test) => test.title === title && test.browser === browser,
      );
      if (matches.length !== 1 || !matches[0]?.passed) {
        findings.push(
          checkFinding(
            "F0_EVIDENCE_NEGATIVE_CONTROL",
            path,
            `Expected one passing ${browser} result for ${title}; found ${String(matches.length)}.`,
          ),
        );
      }
    }
  }
  return { findings };
}

async function inspectLicenseEvidence(): Promise<{
  check: CheckResult;
  counts: { packages: number; assets: number };
}> {
  const findings: CheckResult["findings"] = [];
  let counts = { packages: 0, assets: 0 };
  try {
    const result = await verifyLicenses();
    counts = { packages: result.packages, assets: result.assets };
  } catch (error) {
    findings.push(
      checkFinding(
        "F0_EVIDENCE_LICENSES",
        "dist/licenses.json",
        error instanceof Error ? error.message : "License verification failed.",
      ),
    );
  }
  return { check: { findings }, counts };
}

async function inspectToolchainEvidence(): Promise<{
  check: CheckResult;
  versions: Array<{ name: string; version: string }>;
}> {
  const findings: CheckResult["findings"] = [];
  const versions: Array<{ name: string; version: string }> = [];
  try {
    const result = await inspectToolchain();
    versions.push({ name: "bun", version: result.bun });
    if (result.node) versions.push({ name: "node", version: result.node.version });
    if (result.outcome !== "pass") {
      for (const finding of result.findings) {
        findings.push(
          checkFinding(
            finding.code,
            "tests/fixtures/foundation/toolchain-ledger.json",
            finding.message,
          ),
        );
      }
    }
  } catch (error) {
    findings.push(
      checkFinding(
        "F0_EVIDENCE_TOOLCHAIN",
        "scripts/toolchain-doctor.ts",
        error instanceof Error ? error.message : "Toolchain inspection failed.",
      ),
    );
  }
  return { check: { findings }, versions: versions.sort((left, right) => compare(left.name, right.name)) };
}

async function inspectTraceReferences(
  contract: FoundationContract,
): Promise<{
  globalFindings: F0EvidenceFinding[];
  perTrace: Map<string, F0EvidenceFinding[]>;
}> {
  const globalFindings: F0EvidenceFinding[] = [];
  const perTrace = new Map<string, F0EvidenceFinding[]>();
  const contractIds = contract.traceability.map((trace) => trace.id);
  const uniqueIds = new Set(contractIds);
  if (uniqueIds.size !== contractIds.length) {
    globalFindings.push({
      code: "F0_EVIDENCE_TRACE_DUPLICATE",
      path: "tests/fixtures/foundation/foundation-contract.json#traceability",
      message: "Contract traceability IDs must be unique.",
      traceId: null,
    });
  }

  for (const trace of contract.traceability) {
    const findings: F0EvidenceFinding[] = [];
    const descriptor = traceDescriptors[trace.id];
    if (!descriptor) {
      findings.push({
        code: "F0_EVIDENCE_TRACE_UNMAPPED",
        path: "scripts/verify-f0-evidence.ts#traceDescriptors",
        message: "Trace has no command and evidence mapping.",
        traceId: trace.id,
      });
      perTrace.set(trace.id, findings);
      continue;
    }
    if (
      descriptor.commands.length === 0 ||
      descriptor.commands.some(
        (command) => command.length === 0 || command.some((part) => part.length === 0),
      )
    ) {
      findings.push({
        code: "F0_EVIDENCE_TRACE_COMMAND",
        path: "scripts/verify-f0-evidence.ts#traceDescriptors",
        message: "Trace must reference at least one concrete argv command.",
        traceId: trace.id,
      });
    }
    if (descriptor.evidencePaths.length === 0) {
      findings.push({
        code: "F0_EVIDENCE_TRACE_PATH",
        path: "scripts/verify-f0-evidence.ts#traceDescriptors",
        message: "Trace must reference at least one concrete evidence path.",
        traceId: trace.id,
      });
    }
    for (const path of descriptor.evidencePaths) {
      if (resolve(path) === resolve(outputPath) || !(await Bun.file(path).exists())) {
        findings.push({
          code: "F0_EVIDENCE_TRACE_PATH",
          path,
          message: "Trace evidence path is missing or circular.",
          traceId: trace.id,
        });
      }
    }
    perTrace.set(trace.id, findings);
  }
  for (const descriptorId of Object.keys(traceDescriptors).sort(compare)) {
    if (!uniqueIds.has(descriptorId)) {
      globalFindings.push({
        code: "F0_EVIDENCE_TRACE_EXTRA",
        path: "scripts/verify-f0-evidence.ts#traceDescriptors",
        message: `Mapping is not declared by the contract: ${descriptorId}.`,
        traceId: null,
      });
    }
  }
  return { globalFindings, perTrace };
}

export async function verifyF0Evidence(): Promise<F0EvidenceLedger> {
  const contractPath = "tests/fixtures/foundation/foundation-contract.json";
  const contract = await readJson(contractPath) as FoundationContract;
  const globalFindings: F0EvidenceFinding[] = [];
  if (contract.schemaVersion !== 1 || contract.contractId !== "F0") {
    globalFindings.push({
      code: "F0_EVIDENCE_CONTRACT",
      path: contractPath,
      message: "Expected the version 1 F0 foundation contract.",
      traceId: null,
    });
  }

  const artifact = await inspectArtifactIdentity(contract);
  const browser = await inspectBrowserEvidence(contract, artifact.identity);
  const licenses = await inspectLicenseEvidence();
  const toolchain = await inspectToolchainEvidence();
  const negativeControl = await inspectNegativeControls(contract);
  const references = await inspectTraceReferences(contract);
  globalFindings.push(...references.globalFindings);

  const checks: Record<ValidationKind, CheckResult> = {
    artifact: artifact.check,
    browser: { findings: browser.findings },
    licenses: licenses.check,
    "negative-control": negativeControl,
    toolchain: toolchain.check,
  };
  const traceById = new Map(
    contract.traceability.map((trace) => [trace.id, trace] as const),
  );
  const traces: F0TraceEvidence[] = [];
  for (const traceId of [...traceById.keys()].sort(compare)) {
    const trace = traceById.get(traceId);
    const descriptor = traceDescriptors[traceId];
    if (!trace || !descriptor) continue;
    const findings = [...(references.perTrace.get(traceId) ?? [])];
    for (const validation of descriptor.validations) {
      findings.push(
        ...checks[validation].findings.map((finding) => ({
          ...finding,
          traceId,
        })),
      );
    }
    sortFindings(findings);
    traces.push({
      traceId,
      kind: trace.kind,
      commands: descriptor.commands.map((command) => [...command]),
      evidencePaths: [...descriptor.evidencePaths].sort(compare),
      seed:
        descriptor.validations.includes("browser") ||
        descriptor.validations.includes("negative-control")
          ? browser.seed
          : null,
      outcome: findings.length === 0 ? "pass" : "fail",
      findings,
    });
  }
  if (traces.length !== contract.traceability.length) {
    globalFindings.push({
      code: "F0_EVIDENCE_TRACE_COUNT",
      path: `${contractPath}#traceability`,
      message: `Expected ${String(contract.traceability.length)} ledger rows; produced ${String(traces.length)}.`,
      traceId: null,
    });
  }

  const packageVersions = [
    ...Object.entries(contract.toolchain.runtimeDependencies),
    ...Object.entries(contract.toolchain.developmentDependencies),
  ].map(([name, version]) => ({ name, version }));
  const versions = [...toolchain.versions, ...packageVersions]
    .sort((left, right) => compare(left.name, right.name));
  const allFindings = sortFindings([
    ...globalFindings,
    ...traces.flatMap((trace) => trace.findings),
  ]);
  const ledger: F0EvidenceLedger = {
    schemaVersion: 1,
    contractId: "F0",
    traceId: "F0",
    toolVersion: "jcpe.verify-f0-evidence.v1",
    browserVersion: browser.browserVersions,
    artifactHash: artifact.identity.hash,
    artifactBytes: artifact.identity.bytes,
    mode: "aggregate",
    seed: browser.seed,
    outcome:
      allFindings.length === 0 && traces.every((trace) => trace.outcome === "pass")
        ? "pass"
        : "fail",
    findings: allFindings,
    versions,
    seeds: [{ scope: "standalone-browser-matrix", value: browser.seed }],
    licenseCounts: licenses.counts,
    browserRun: {
      runId: browser.runId,
      expectedCells: browser.expectedCells,
      observedCells: browser.observedCells,
      evidenceDirectory: browser.evidenceDirectory,
    },
    traces,
  };
  await atomicWrite(outputPath, stableJson(ledger));
  return ledger;
}

if (import.meta.main) {
  try {
    const ledger = await verifyF0Evidence();
    console.log(stableJson(ledger).trimEnd());
    process.exitCode = ledger.outcome === "pass" ? 0 : 1;
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          schema: "jcpe.verify-f0-evidence.v1",
          outcome: "tool-failure",
          message:
            error instanceof Error ? error.message : "F0 evidence verification failed.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 2;
  }
}
