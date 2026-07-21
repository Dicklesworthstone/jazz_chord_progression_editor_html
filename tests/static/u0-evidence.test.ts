import { describe, expect, test } from "bun:test";

import {
  U0_BROWSER_OWNER_FILES,
  U0_BUN_OWNER_FILES,
  U0_EXACT_OWNER_FILES,
  U0_EXPECTED_COUNTS,
  buildU0TraceEvidence,
  inspectU0JUnit,
  inspectU0PlaywrightReport,
  inspectU0TestControls,
  sanitizeU0JUnit,
  stableU0EvidenceJson,
  u0EvidenceDigest,
  u0EvidenceTestSupport,
  validateU0AutomatedAccessibilityBoundary,
  validateU0BrowserCells,
  validateU0EvidenceCandidate,
  validateU0ManualAccessibilityLedger,
  type U0BrowserCell,
  type U0JUnitSummary,
} from "../../scripts/verify-u0-evidence";
import contractFixture from "../fixtures/ui/u0-ui-contract.json";
import traceFixture from "../fixtures/ui/trace-ledger.json";

type JsonRecord = Record<string, unknown>;

const HASH = "a".repeat(64);
const RUN_ID = "b".repeat(32);
const TITLE = "U0-ENV-004 synthetic exact-owner proof";
const OWNER = "tests/e2e/u0-touch-targets.spec.ts";
const MANUAL_IDS = [
  "U0-MANUAL-KEYBOARD",
  "U0-MANUAL-FOCUS",
  "U0-MANUAL-REFLOW-200",
  "U0-MANUAL-MOTION",
  "U0-MANUAL-FORCED-COLORS",
  "U0-MANUAL-SCREEN-READER",
] as const;

const manualChecks = {
  "U0-MANUAL-KEYBOARD": {
    allActionsReachableWithoutPointer: true,
    arrowKeysCreateNoTrap: true,
    dragAlternativesComplete: true,
    escapeCancelsOrCloses: true,
    tabOrderMatchesContract: true,
  },
  "U0-MANUAL-FOCUS": {
    focusNotClippedOrObscured: true,
    focusRestoredToInvoker: true,
    topmostDismissalCorrect: true,
    visibleFocus: true,
  },
  "U0-MANUAL-REFLOW-200": {
    browserZoomNotBlocked: true,
    pageHorizontalOverflowAbsent: true,
    primaryControlsOperable: true,
    transportVisible: true,
  },
  "U0-MANUAL-MOTION": {
    largeTransformsAbsent: true,
    nonessentialMotionSuppressed: true,
    smoothScrollAbsent: true,
    stateChangesPerceivable: true,
  },
  "U0-MANUAL-FORCED-COLORS": {
    controlBoundariesVisible: true,
    focusIndicatorVisible: true,
    stateMeaningPreserved: true,
  },
  "U0-MANUAL-SCREEN-READER": {
    focusOrderCoherent: true,
    landmarksAndHeadingsAnnounced: true,
    namesAnnounced: true,
    statesAnnounced: true,
  },
} as const;

function manualLedger(): JsonRecord {
  const traceLedgerSha256 =
    contractFixture.reviewedFileSha256["trace-ledger.json"];
  return {
    schema: "changes.evidence.u0-manual-accessibility.v1",
    package: "U0",
    authority: {
      contractSchema: "changes.ui.u0-contract.v1",
      contractVersion: 1,
      traceId: "TR-U0-AXE",
      traceLedgerSha256,
    },
    artifact: {
      path: "jazz_chord_progression_editor.html",
      bytes: 42,
      sha256: HASH,
    },
    attestation: {
      automationMadeNoManualClaim: true,
      observationsRecordedAfterHumanInteraction: true,
    },
    rows: MANUAL_IDS.map((id, index) => ({
      id,
      status: "pass",
      operator: "Alex Reviewer",
      observedAt: "2026-07-16T12:00:00.000Z",
      platform: { name: "macOS", version: "15.5" },
      browser: { name: "Safari", version: "18.5" },
      observedResult:
        `Direct human observation ${String(index + 1)} completed without a failure.`,
      checks: manualChecks[id],
      attachments: [{
        path:
          `test-results/u0-manual-accessibility-artifacts/${HASH}/${String(index)}.txt`,
        mediaType: "text/plain",
        bytes: 12,
        sha256: String(index + 1).padStart(64, "0"),
      }],
      ...(id === "U0-MANUAL-REFLOW-200"
        ? {
            method: "browser-ui-zoom",
            zoomPercent: 200,
            startingViewportCssPx: { width: 1280, height: 800 },
            reflowViewportCssPx: { width: 320, height: 568 },
          }
        : {}),
      ...(id === "U0-MANUAL-SCREEN-READER"
        ? {
            assistiveTechnology: { name: "VoiceOver", version: "15.5" },
            spokenResult:
              "Landmarks, names, states, and focus order were spoken coherently.",
          }
        : {}),
    })),
  };
}

function rawCell(
  project: string,
  producerFile = OWNER,
  traceId = "TR-U0-TOUCH",
): JsonRecord {
  return {
    schema: "changes.ui.u0-browser-evidence-cell.v1",
    runId: RUN_ID,
    cellId: `synthetic-${project}`,
    package: "U0",
    outcome: "pass",
    error: null,
    browser: { name: project, version: "1.2.3" },
    playwrightVersion: "1.61.1",
    artifact: { bytes: 42, sha256: HASH },
    viewport: { height: 800, width: 1280 },
    environment: { synthetic: true },
    bindings: [{ caseId: "U0-ENV-004", traceIds: [traceId] }],
    observations: { exactOwner: true },
    diagnostics: {
      consoleErrors: [],
      pageErrors: [],
      requests: [{
        method: "GET",
        resourceType: "document",
        url: "http://127.0.0.1/changes.html",
      }],
    },
    screenshots: [],
    producer: { file: producerFile, title: TITLE },
    retry: 0,
    repeatEachIndex: 0,
    workerIndex: 0,
  };
}

function encodedCell(value: JsonRecord): Readonly<{
  body: string;
  bytes: Uint8Array;
}> {
  const bytes = new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
  return { body: Buffer.from(bytes).toString("base64"), bytes };
}

function playwrightReport(
  mutate?: (value: JsonRecord) => void,
): JsonRecord {
  const tests = ["chromium", "firefox", "webkit"].map((project) => {
    const encoded = encodedCell(rawCell(project));
    return {
      annotations: [],
      expectedStatus: "passed",
      projectId: project,
      projectName: project,
      results: [{
        annotations: [],
        attachments: [{
          name: `synthetic-${project}.json`,
          contentType: "application/json",
          body: encoded.body,
        }],
        errors: [],
        retry: 0,
        status: "passed",
      }],
      status: "expected",
    };
  });
  const value: JsonRecord = {
    config: {
      forbidOnly: true,
      fullyParallel: false,
      globalTimeout: 3_600_000,
      workers: 1,
      version: "1.61.1",
      projects: ["chromium", "firefox", "webkit"].map((name) => ({
        name,
        retries: 0,
        repeatEach: 1,
      })),
    },
    errors: [],
    stats: { expected: 3, skipped: 0, unexpected: 0, flaky: 0 },
    suites: [{
      title: "e2e/u0-touch-targets.spec.ts",
      file: "e2e/u0-touch-targets.spec.ts",
      suites: [],
      specs: [{
        title: TITLE,
        file: "e2e/u0-touch-targets.spec.ts",
        ok: true,
        tags: [],
        tests,
      }],
    }],
  };
  mutate?.(value);
  return value;
}

function splitProjectPlaywrightReport(): JsonRecord {
  const value = playwrightReport();
  const suites = value["suites"] as JsonRecord[];
  const specs = suites[0]?.["specs"] as JsonRecord[];
  const spec = specs[0];
  if (suites[0] !== undefined && spec !== undefined) {
    const tests = spec["tests"] as JsonRecord[];
    suites[0]["specs"] = tests.map((test) => ({
      ...spec,
      tests: [test],
    }));
  }
  return value;
}

function browserCell(
  value: JsonRecord,
  source: "attachment" | "persisted",
): U0BrowserCell {
  const bytes = encodedCell(value).bytes;
  return {
    value,
    bytes: bytes.byteLength,
    sha256: u0EvidenceDigestBytes(bytes),
    source,
    path: `${source}/${String(value["cellId"])}.json`,
  };
}

function u0EvidenceDigestBytes(value: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}

describe("U0 evidence verifier self-controls", () => {
  test("canonicalizes and hashes evidence independently of object key order", () => {
    const left = { z: [3, { b: 2, a: 1 }], a: true };
    const right = { a: true, z: [3, { a: 1, b: 2 }] };
    expect(stableU0EvidenceJson(left)).toBe(stableU0EvidenceJson(right));
    expect(u0EvidenceDigest(left)).toBe(u0EvidenceDigest(right));
    expect(u0EvidenceDigest(left)).toMatch(/^[a-f0-9]{64}$/u);
  });

  test("freezes the exact 20-owner split from the reviewed trace ledger", () => {
    expect(traceFixture.traces).toHaveLength(U0_EXPECTED_COUNTS.traces);
    expect(U0_EXACT_OWNER_FILES).toHaveLength(U0_EXPECTED_COUNTS.owners);
    expect(U0_BUN_OWNER_FILES).toHaveLength(U0_EXPECTED_COUNTS.bunOwners);
    expect(U0_BROWSER_OWNER_FILES).toHaveLength(U0_EXPECTED_COUNTS.browserOwners);
    expect(new Set(U0_EXACT_OWNER_FILES).size).toBe(U0_EXPECTED_COUNTS.owners);
  });

  test("keeps the public U0 evidence alias and aggregate gate wired in package order", async () => {
    const manifest = await Bun.file("package.json").json() as Readonly<{
      scripts?: Readonly<Record<string, string>>;
    }>;
    expect(manifest.scripts?.["verify:u0-evidence"]).toBe(
      "bun scripts/verify-u0-evidence.ts",
    );

    const aggregate = await Bun.file("scripts/verify.ts").text();
    const a0Index = aggregate.indexOf('id: "a0-evidence"');
    const u0Index = aggregate.indexOf('id: "u0-evidence"');
    const c0Index = aggregate.indexOf('id: "c0-evidence"');
    expect(a0Index).toBeGreaterThanOrEqual(0);
    expect(u0Index).toBeGreaterThan(a0Index);
    expect(c0Index).toBeGreaterThan(u0Index);
    expect(
      aggregate.slice(u0Index, c0Index),
    ).toContain('command: [process.execPath, "scripts/verify-u0-evidence.ts"]');
  });

  test("parses sanitized exact JUnit and rejects forged counts or duplicate identities", () => {
    const valid = '<?xml version="1.0"?><testsuites tests="1" assertions="2" failures="0" errors="0" skipped="0"><testsuite hostname="private-host"><testcase name="U0 proof" file="tests/proof.test.ts" /></testsuite></testsuites>';
    const sanitized = sanitizeU0JUnit(valid);
    expect(sanitized).not.toContain("private-host");
    expect(inspectU0JUnit(sanitized).summary).toEqual({
      tests: 1,
      assertions: 2,
      failures: 0,
      errors: 0,
      skipped: 0,
      files: ["tests/proof.test.ts"],
      cases: [{ file: "tests/proof.test.ts", name: "U0 proof" }],
    });
    expect(inspectU0JUnit(valid.replace('tests="1"', 'tests="2"')).summary)
      .toBeNull();
    const duplicate = valid.replace(
      "</testsuite>",
      '<testcase name="U0 proof" file="tests/proof.test.ts" /></testsuite>',
    ).replace('tests="1"', 'tests="2"');
    expect(inspectU0JUnit(duplicate).summary).toBeNull();
  });

  test("rejects skip, todo, only, expected failure, quarantine, slow, and retry controls", () => {
    const findings = inspectU0TestControls("synthetic.spec.ts", `
      import { test as spec } from "@playwright/test";
      spec.skip("skip", () => {});
      spec.fixme("fixme", () => {});
      spec.only("only", () => {});
      spec.fail("expected failure", () => {});
      spec.slow();
      quarantine("known issue");
      spec("retry", () => {}, { retry: 2 });
      spec.describe.configure({ retries: 2 });
      xit("disabled", () => {});
    `);
    const codes = findings.map(({ code }) => code);
    expect(codes).toContain("U0_EVIDENCE_QUARANTINE");
    expect(codes).toContain("U0_EVIDENCE_RETRY");
    expect(findings).toHaveLength(9);
  });

  test("accepts a three-engine Playwright report and rejects retry or producer forgery", () => {
    const inspected = inspectU0PlaywrightReport(playwrightReport());
    expect(inspected.findings).toEqual([]);
    expect(inspected.files).toEqual([OWNER]);
    expect(inspected.tests).toBe(3);
    expect(inspected.cells).toHaveLength(3);
    const split = inspectU0PlaywrightReport(splitProjectPlaywrightReport());
    expect(split.findings).toEqual([]);
    expect(split.tests).toBe(3);
    expect(split.cells).toHaveLength(3);

    const retry = inspectU0PlaywrightReport(playwrightReport((value) => {
      const suites = value["suites"] as JsonRecord[];
      const specs = suites[0]?.["specs"] as JsonRecord[];
      const tests = specs[0]?.["tests"] as JsonRecord[];
      const results = tests[0]?.["results"] as JsonRecord[];
      if (results[0] !== undefined) results[0]["retry"] = 1;
    }));
    expect(retry.findings.map(({ code }) => code))
      .toContain("U0_EVIDENCE_PLAYWRIGHT_RESULT");

    const producer = inspectU0PlaywrightReport(playwrightReport((value) => {
      const suites = value["suites"] as JsonRecord[];
      const specs = suites[0]?.["specs"] as JsonRecord[];
      const tests = specs[0]?.["tests"] as JsonRecord[];
      const results = tests[0]?.["results"] as JsonRecord[];
      const attachments = results[0]?.["attachments"] as JsonRecord[];
      const forged = rawCell("chromium", "tests/e2e/u0-landmarks.spec.ts");
      if (attachments[0] !== undefined) {
        attachments[0]["body"] = encodedCell(forged).body;
      }
    }));
    expect(producer.findings.map(({ code }) => code))
      .toContain("U0_EVIDENCE_ATTACHMENT_PRODUCER");
  });

  test("rejects a byte-mismatched raw cell and a case claimed by the wrong planned owner", () => {
    const wrongOwner = rawCell(
      "chromium",
      "tests/e2e/u0-landmarks.spec.ts",
      "TR-U0-TOUCH",
    );
    const persisted = browserCell(wrongOwner, "persisted");
    const attachment = {
      ...browserCell(wrongOwner, "attachment"),
      sha256: "c".repeat(64),
    };
    const codes = validateU0BrowserCells({
      runId: RUN_ID,
      attachmentCells: [attachment],
      persistedCells: [persisted],
    }).map(({ code }) => code);
    expect(codes).toContain("U0_EVIDENCE_CELL_OWNER");
    expect(codes).toContain("U0_EVIDENCE_CELL_ATTACHMENT_MISMATCH");
  });

  test("isolates only the pinned WebKit screenshot synchronization mutation", () => {
    const valid = rawCell("webkit");
    valid["screenshots"] = [{
      bytes: 12,
      filename: "U0-ENV-004-webkit.png",
      harness: {
        browserName: "webkit",
        consoleErrors: [
          "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.",
        ],
        isolated: true,
        pageErrors: [],
        strictCsp: true,
        syncStyleInsertions: 1,
        syncStyleRemovals: 1,
        unexpectedStyleMutations: 0,
      },
      sha256: HASH,
    }];
    const validCodes = validateU0BrowserCells({
      runId: RUN_ID,
      attachmentCells: [browserCell(valid, "attachment")],
      persistedCells: [browserCell(valid, "persisted")],
    }).map(({ code }) => code);
    expect(validCodes).not.toContain("U0_EVIDENCE_SCREENSHOT_HARNESS");

    const forged = structuredClone(valid);
    const screenshots = forged["screenshots"] as JsonRecord[];
    const harness = screenshots[0]?.["harness"] as JsonRecord | undefined;
    if (harness !== undefined) harness["syncStyleRemovals"] = 0;
    const forgedCodes = validateU0BrowserCells({
      runId: RUN_ID,
      attachmentCells: [browserCell(forged, "attachment")],
      persistedCells: [browserCell(forged, "persisted")],
    }).map(({ code }) => code);
    expect(forgedCodes).toContain("U0_EVIDENCE_SCREENSHOT_HARNESS");
  });

  test("keeps automation pending and accepts only a separate artifact-bound human ledger", () => {
    const pending = rawCell(
      "chromium",
      "tests/e2e/u0-accessibility.spec.ts",
      "TR-U0-AXE",
    );
    pending["observations"] = {
      manualScriptLedger: {
        claimBoundary: {
          hardwareCertification: "Not claimed.",
          pending: "Named manual evidence remains pending.",
        },
        scripts: MANUAL_IDS.map((id) => ({
          id,
          manualDeviceStatus: "pending-Q0",
        })),
      },
    };
    expect(
      validateU0AutomatedAccessibilityBoundary([
        browserCell(pending, "persisted"),
      ])
        .map(({ code }) => code),
    ).toEqual([]);

    const forgedAutomation = structuredClone(pending);
    const observations = forgedAutomation["observations"] as JsonRecord;
    const forgedLedger = observations["manualScriptLedger"] as JsonRecord;
    forgedLedger["operator"] = "Human operator 1";
    const scripts = forgedLedger["scripts"] as JsonRecord[];
    for (const script of scripts) script["manualDeviceStatus"] = "pass";
    expect(
      validateU0AutomatedAccessibilityBoundary([
        browserCell(forgedAutomation, "persisted"),
      ]).map(({ code }) => code),
    ).toEqual(["U0_EVIDENCE_AUTOMATED_ACCESSIBILITY_BOUNDARY"]);

    const human = manualLedger();
    expect(validateU0ManualAccessibilityLedger(
      human,
      { bytes: 42, sha256: HASH },
    )).toEqual([]);

    const placeholder = structuredClone(human);
    const placeholderRows = placeholder["rows"] as JsonRecord[];
    if (placeholderRows[0] !== undefined) {
      placeholderRows[0]["operator"] = "Human operator 1";
    }
    expect(validateU0ManualAccessibilityLedger(
      placeholder,
      { bytes: 42, sha256: HASH },
    ).map(({ code }) => code)).toContain(
      "U0_EVIDENCE_MANUAL_ROW_OBSERVATION",
    );

    const extraCheck = structuredClone(human);
    const extraCheckRows = extraCheck["rows"] as JsonRecord[];
    const checks = extraCheckRows[0]?.["checks"] as JsonRecord | undefined;
    if (checks !== undefined) checks["unreviewedProxy"] = true;
    expect(validateU0ManualAccessibilityLedger(
      extraCheck,
      { bytes: 42, sha256: HASH },
    ).map(({ code }) => code)).toContain("U0_EVIDENCE_MANUAL_ROW_CHECKS");

    const repeatedAttachment = structuredClone(human);
    const repeatedRows = repeatedAttachment["rows"] as JsonRecord[];
    const firstRow = repeatedRows.at(0);
    const secondRow = repeatedRows.at(1);
    if (firstRow === undefined || secondRow === undefined) {
      throw new Error("U0_MANUAL_TEST_ATTACHMENT_ROWS_MISSING");
    }
    const firstAttachments = firstRow["attachments"] as JsonRecord[];
    const secondAttachments = secondRow["attachments"] as JsonRecord[];
    const firstAttachment = firstAttachments[0];
    const secondAttachment = secondAttachments[0];
    if (firstAttachment !== undefined && secondAttachment !== undefined) {
      secondAttachment["sha256"] = firstAttachment["sha256"];
    }
    expect(validateU0ManualAccessibilityLedger(
      repeatedAttachment,
      { bytes: 42, sha256: HASH },
    ).map(({ code }) => code)).toContain(
      "U0_EVIDENCE_MANUAL_ATTACHMENT_CONTENT_DUPLICATE",
    );

    const proxyZoom = structuredClone(human);
    const humanRows = proxyZoom["rows"] as JsonRecord[];
    const reflow = humanRows.find((row) =>
      row["id"] === "U0-MANUAL-REFLOW-200"
    );
    if (reflow !== undefined) reflow["method"] = "effective-css-pixel-proxy";
    expect(validateU0ManualAccessibilityLedger(
      proxyZoom,
      { bytes: 42, sha256: HASH },
    ).map(({ code }) => code)).toContain("U0_EVIDENCE_MANUAL_REFLOW");

    const duplicate = structuredClone(human);
    const duplicateRows = duplicate["rows"] as JsonRecord[];
    if (duplicateRows[1] !== undefined) {
      duplicateRows[1]["id"] = "U0-MANUAL-KEYBOARD";
    }
    expect(validateU0ManualAccessibilityLedger(
      duplicate,
      { bytes: 42, sha256: HASH },
    ).map(({ code }) => code)).toContain(
      "U0_EVIDENCE_MANUAL_ROW_INVENTORY",
    );
  });

  test("builds passing exact-owner trace rows only from observed JUnit case names", () => {
    const cases: Array<{ file: string; name: string }> = [];
    for (const owner of U0_BUN_OWNER_FILES) {
      const rows = traceFixture.traces.filter((trace) =>
        trace.plannedEvidenceOwner === owner
      );
      cases.push({
        file: owner,
        name: `proof ${rows.flatMap(({ caseIds }) => caseIds).join(" ")}`,
      });
    }
    const junit: U0JUnitSummary = {
      tests: cases.length,
      assertions: cases.length,
      failures: 0,
      errors: 0,
      skipped: 0,
      files: [...U0_BUN_OWNER_FILES],
      cases,
    };
    const traces = buildU0TraceEvidence({
      junit,
      browserCells: [],
    });
    const bunTraces = traces.filter((trace) =>
      U0_BUN_OWNER_FILES.includes(String(trace["owner"]))
    );
    expect(bunTraces).toHaveLength(U0_EXPECTED_COUNTS.bunOwners);
    expect(bunTraces.every((trace) => trace["outcome"] === "pass")).toBe(true);

    const brokenJunit: U0JUnitSummary = {
      ...junit,
      cases: junit.cases.map((candidate, index) =>
        index === 0 ? { ...candidate, name: "proof without a reviewed case ID" } : candidate
      ),
    };
    expect(buildU0TraceEvidence({ junit: brokenJunit, browserCells: [] })
      .some((trace) => trace["outcome"] === "fail")).toBe(true);

    const firstOwner = U0_BUN_OWNER_FILES[0] ?? "";
    const firstRequiredCaseIds = traceFixture.traces
      .filter((trace) => trace.plannedEvidenceOwner === firstOwner)
      .flatMap(({ caseIds }) => caseIds);
    const nearMissJunit: U0JUnitSummary = {
      ...junit,
      cases: junit.cases.map((candidate) =>
        candidate.file === firstOwner
          ? {
              ...candidate,
              name: `proof ${firstRequiredCaseIds.map((id) => `${id}x`).join(" ")}`,
            }
          : candidate
      ),
    };
    expect(buildU0TraceEvidence({ junit: nearMissJunit, browserCells: [] })
      .find((trace) => trace["owner"] === firstOwner)?.["outcome"]).toBe("fail");
  });

  test("rejects unsigned, stale, owner-forged, and incomplete ledgers", () => {
    const codes = validateU0EvidenceCandidate({}, HASH).map(({ code }) => code);
    expect(codes).toContain("U0_EVIDENCE_DIGEST");
    expect(codes).toContain("U0_EVIDENCE_LEDGER_IDENTITY");
    expect(codes).toContain("U0_EVIDENCE_RUN_ID");
    expect(codes).toContain("U0_EVIDENCE_INPUT_STALE");
    expect(codes).toContain("U0_EVIDENCE_TRACE");
    expect(codes).toContain("U0_EVIDENCE_OWNER_INVENTORY");

    const signed = u0EvidenceTestSupport.signedLedger({
      schema: "changes.evidence.u0.v1",
      schemaVersion: 1,
      package: "U0",
      toolVersion: "changes.evidence.u0-verifier.v1",
      outcome: "pass",
      findings: [],
      nonce: "d".repeat(32),
      runId: "e".repeat(32),
      input: { pre: { digest: HASH }, post: { digest: HASH } },
      traces: [],
      owners: { exact: [] },
    });
    const signedCodes = validateU0EvidenceCandidate(signed, HASH)
      .map(({ code }) => code);
    expect(signedCodes).not.toContain("U0_EVIDENCE_DIGEST");
    expect(signedCodes).toContain("U0_EVIDENCE_CONTRACT_IDENTITY");
    expect(signedCodes).toContain("U0_EVIDENCE_VALIDATOR_CLAIM");
    expect(signedCodes).toContain("U0_EVIDENCE_BUN_CLAIM");
    expect(signedCodes).toContain("U0_EVIDENCE_BROWSER_CLAIM");
    expect(signedCodes).toContain("U0_EVIDENCE_MANUAL_CLAIM");
    expect(signedCodes).toContain("U0_EVIDENCE_ARTIFACT_INVENTORY");
  });

  test("reconstructs raw artifacts instead of trusting a re-signed summary", async () => {
    const candidate = u0EvidenceTestSupport.signedLedger({
      schema: "changes.evidence.u0.v1",
      schemaVersion: 1,
      package: "U0",
      toolVersion: "changes.evidence.u0-verifier.v1",
      outcome: "pass",
      findings: [],
      nonce: "1".repeat(32),
      runId: "2".repeat(32),
      input: {
        pre: {
          algorithm: "sha256-component-manifest-v1",
          digest: HASH,
          components: [{ group: "test", path: "proof", bytes: 1, sha256: HASH }],
        },
        post: {
          algorithm: "sha256-component-manifest-v1",
          digest: HASH,
          components: [{ group: "test", path: "proof", bytes: 1, sha256: HASH }],
        },
      },
      traces: [],
      owners: { exact: [] },
      artifacts: [],
    });
    const reconstruction = await u0EvidenceTestSupport
      .reconstructStoredU0Evidence(candidate, {
        algorithm: "sha256-component-manifest-v1",
        digest: HASH,
        components: [{ group: "test", path: "proof", bytes: 1, sha256: HASH }],
      });
    expect(reconstruction.map(({ code }) => code)).toContain(
      "U0_EVIDENCE_RAW_ARTIFACT_MISSING",
    );
    const artifactFindings = await u0EvidenceTestSupport
      .verifyStoredArtifacts({ artifacts: [] });
    expect(artifactFindings.map(({ code }) => code)).toContain(
      "U0_EVIDENCE_ARTIFACT_INVENTORY",
    );
  });
});
