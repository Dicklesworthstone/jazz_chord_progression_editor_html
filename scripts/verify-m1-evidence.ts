/**
 * M1 evidence gate (jcpe-qbvz).
 *
 * Independently verifies the production M1 automated-import pipeline from a
 * clean invocation and emits a hash-bound machine-readable ledger under
 * test-results/m1-evidence/. The gate:
 *
 * 1. snapshots the complete M1 input closure (production, contract, doc,
 *    fixture packet, validator, unit suites, e2e specs) before and after
 *    every run and rejects drift;
 * 2. verifies every fixture family byte-pin recorded in m1-contract.json
 *    against the files on disk and records per-family case counts;
 * 3. re-runs the spec validator and the exact M1 unit suites as child
 *    processes, requiring zero failures and zero skips;
 * 4. runs an in-process determinism sweep: every M0 golden fixture is
 *    decoded through the real embedded wasm frame and planned by
 *    planAutomationImport twice, requiring canonical-JSON equality, and the
 *    plan's work counters (bars, written chords, unwritten spans, chunks,
 *    code points) plus the groove choice are recorded per case.
 *
 * Wall time and resource numbers are measurements, never semantic inputs.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { cpus, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { planAutomationImport } from "../src/export/midi-import-automation";
import {
  GOLDEN_CASES,
  decodeGolden,
} from "../tests/support/midi-import-test-kit";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER_DIR = resolve(ROOT, "test-results/m1-evidence");
const LEDGER_PATH = resolve(LEDGER_DIR, "m1-evidence-ledger.json");
const FIXTURE_DIR = "tests/fixtures/midi-import-automation";

const INPUT_CLOSURE = Object.freeze([
  "docs/M1_MIDI_IMPORT_AUTOMATION_CONTRACT.md",
  "scripts/validate-m1-contract.ts",
  "src/application/studio-midi-import.ts",
  "src/export/midi-import-automation-contract.ts",
  "src/export/midi-import-automation.ts",
  "src/export/midi-import-chart.ts",
  "src/export/midi-import-contract.ts",
  "src/export/midi-import.ts",
  `${FIXTURE_DIR}/classification-cases.json`,
  `${FIXTURE_DIR}/envelope-cases.json`,
  `${FIXTURE_DIR}/groove-cases.json`,
  `${FIXTURE_DIR}/key-cases.json`,
  `${FIXTURE_DIR}/m1-contract.json`,
  `${FIXTURE_DIR}/mutation-controls.json`,
  `${FIXTURE_DIR}/rerank-cases.json`,
  `${FIXTURE_DIR}/segmentation-cases.json`,
  `${FIXTURE_DIR}/trace-golden.json`,
  `${FIXTURE_DIR}/transfer-cases.json`,
  "tests/fixtures/midi-import/golden-cases.json",
  "tests/e2e/m1-midi-import-advanced.spec.ts",
  "tests/e2e/m1-midi-import-auto.spec.ts",
  "tests/support/midi-import-test-kit.ts",
  "tests/unit/midi-import-automation-contract.test.ts",
  "tests/unit/midi-import-automation.test.ts",
] as const);

const TEST_FILES = INPUT_CLOSURE.filter((path) => path.endsWith(".test.ts"));
const MINIMUM_SUITE_PASSES = 23;

type Finding = Readonly<{ code: string; path: string; message: string }>;

class Findings {
  readonly list: Finding[] = [];
  add(code: string, path: string, message: string): void {
    this.list.push({ code, path, message });
  }
}

async function sha256File(
  path: string,
): Promise<{ bytes: number; sha256: string }> {
  const data = await readFile(resolve(ROOT, path));
  return {
    bytes: data.byteLength,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
}

type ClosureSnapshot = Readonly<{
  algorithm: "sha256-component-manifest-v1";
  digest: string;
  components: readonly Readonly<{
    path: string;
    bytes: number;
    sha256: string;
  }>[];
}>;

async function snapshotClosure(): Promise<ClosureSnapshot> {
  const components = [];
  for (const path of INPUT_CLOSURE) {
    const { bytes, sha256 } = await sha256File(path);
    components.push({ path, bytes, sha256 });
  }
  const digest = createHash("sha256")
    .update(
      components
        .map((c) => `${c.path}:${String(c.bytes)}:${c.sha256}`)
        .join("\n"),
    )
    .digest("hex");
  return { algorithm: "sha256-component-manifest-v1", digest, components };
}

type Execution = Readonly<{
  command: readonly string[];
  exitCode: number;
  elapsedMs: number;
  stdoutSha256: string;
  stderrSha256: string;
  stdoutTail: string;
}>;

async function runChild(command: readonly string[]): Promise<Execution> {
  const startedAt = performance.now();
  const child = Bun.spawn([...command], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return {
    command,
    exitCode,
    elapsedMs: performance.now() - startedAt,
    stdoutSha256: createHash("sha256").update(stdout).digest("hex"),
    stderrSha256: createHash("sha256").update(stderr).digest("hex"),
    stdoutTail: (stdout + stderr).split("\n").slice(-12).join("\n"),
  };
}

/** Key-sorted JSON so structural equality is byte equality. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

type FamilyPinCheck = Readonly<{
  file: string;
  pinnedSha256: string;
  actualSha256: string;
  match: boolean;
  caseCount: number | null;
}>;

async function checkFamilyPins(
  findings: Findings,
): Promise<readonly FamilyPinCheck[]> {
  const contractRaw = await readFile(
    resolve(ROOT, FIXTURE_DIR, "m1-contract.json"),
    "utf8",
  );
  const contract = JSON.parse(contractRaw) as Readonly<{
    families: readonly Readonly<{ file: string; sha256: string }>[];
    traceGolden: Readonly<{ file: string; sha256: string }>;
  }>;
  const pins = [...contract.families, contract.traceGolden];
  const checks: FamilyPinCheck[] = [];
  for (const pin of pins) {
    const path = `${FIXTURE_DIR}/${pin.file}`;
    const { sha256 } = await sha256File(path);
    const raw = await readFile(resolve(ROOT, path), "utf8");
    const parsed = JSON.parse(raw) as Readonly<{ cases?: readonly unknown[] }>;
    const caseCount = Array.isArray(parsed.cases) ? parsed.cases.length : null;
    const match = sha256 === pin.sha256;
    if (!match) {
      findings.add(
        "M1E_FAMILY_PIN",
        path,
        `fixture drifted from its m1-contract.json pin: pinned ${pin.sha256}, actual ${sha256}`,
      );
    }
    checks.push({
      file: pin.file,
      pinnedSha256: pin.sha256,
      actualSha256: sha256,
      match,
      caseCount,
    });
  }
  return checks;
}

type PlanSweepResult = Readonly<{
  goldenId: string;
  outcome: "planned" | "automation-refused" | "decode-refused";
  refusalCode: string | null;
  deterministic: boolean;
  planDigest: string | null;
  workCounters: Readonly<Record<string, number>> | null;
  grooveStyleId: string | null;
}>;

async function sweepGoldenPlans(
  findings: Findings,
): Promise<readonly PlanSweepResult[]> {
  const results: PlanSweepResult[] = [];
  for (const golden of GOLDEN_CASES) {
    const first = await decodeGolden(golden.id);
    const second = await decodeGolden(golden.id);
    if (!first.ok || !second.ok) {
      results.push({
        goldenId: golden.id,
        outcome: "decode-refused",
        refusalCode: first.ok ? null : first.refusal.code,
        deterministic: first.ok === second.ok,
        planDigest: null,
        workCounters: null,
        grooveStyleId: null,
      });
      continue;
    }
    const planA = planAutomationImport(first.value, `${golden.id}.mid`);
    const planB = planAutomationImport(second.value, `${golden.id}.mid`);
    const canonicalA = canonicalJson(planA);
    const canonicalB = canonicalJson(planB);
    const deterministic = canonicalA === canonicalB;
    if (!deterministic) {
      findings.add(
        "M1E_DETERMINISM",
        golden.id,
        "planAutomationImport disagreed with itself across two decodes of the same bytes",
      );
    }
    if (!planA.ok) {
      results.push({
        goldenId: golden.id,
        outcome: "automation-refused",
        refusalCode: planA.refusal.code,
        deterministic,
        planDigest: createHash("sha256").update(canonicalA).digest("hex"),
        workCounters: null,
        grooveStyleId: null,
      });
      continue;
    }
    const plan = planA.plan;
    results.push({
      goldenId: golden.id,
      outcome: "planned",
      refusalCode: null,
      deterministic,
      planDigest: createHash("sha256").update(canonicalA).digest("hex"),
      workCounters: Object.freeze({
        measureCount: plan.measureCount,
        writtenChordCount: plan.writtenChordCount,
        unwrittenSpanCount: plan.unwrittenSpanCount,
        emptyMeasureCount: plan.emptyMeasureCount,
        chunkCount: plan.chunkTexts.length,
        codePointCount: plan.codePointCount,
        classifiedTracks: plan.classifications.length,
        spans: plan.spans.length,
        sections: plan.sections.length,
      }),
      grooveStyleId: plan.groove.grooveStyleId,
    });
  }
  return results;
}

async function main(): Promise<void> {
  const findings = new Findings();
  const before = await snapshotClosure();

  const familyPins = await checkFamilyPins(findings);

  const validator = await runChild([
    process.execPath,
    "scripts/validate-m1-contract.ts",
  ]);
  if (validator.exitCode !== 0) {
    findings.add(
      "M1E_VALIDATOR",
      "validate-m1-contract",
      "spec validator failed",
    );
  }

  const suite = await runChild([process.execPath, "test", ...TEST_FILES]);
  const summary = suite.stdoutTail;
  const passMatch = /(\d+) pass/u.exec(summary);
  const failMatch = /(\d+) fail/u.exec(summary);
  const skipMatch = /(\d+) skip/u.exec(summary);
  const passes = passMatch ? Number(passMatch[1]) : 0;
  const failures = failMatch ? Number(failMatch[1]) : -1;
  const skips = skipMatch ? Number(skipMatch[1]) : 0;
  if (
    suite.exitCode !== 0 ||
    failures !== 0 ||
    skips !== 0 ||
    passes < MINIMUM_SUITE_PASSES
  ) {
    findings.add(
      "M1E_SUITE",
      "bun test",
      `suite not clean: exit ${String(suite.exitCode)}, pass ${String(passes)}, fail ${String(failures)}, skip ${String(skips)}`,
    );
  }

  const sweep = await sweepGoldenPlans(findings);

  const after = await snapshotClosure();
  if (after.digest !== before.digest) {
    findings.add(
      "M1E_DRIFT",
      "input-closure",
      "the input closure changed while the gate ran",
    );
  }

  const outcome = findings.list.length === 0 ? "pass" : "fail";
  const ledger = {
    schema: "jcpe.m1-evidence.v1",
    traceId: "M1-EVIDENCE-01",
    outcome,
    tool: {
      bun: Bun.version,
      platform: `${platform()} ${release()}`,
      cpuCount: cpus().length,
    },
    inputClosure: before,
    inputClosureAfter: { digest: after.digest, drift: after.digest !== before.digest },
    fixtureFamilies: familyPins,
    gates: {
      validator: {
        exitCode: validator.exitCode,
        elapsedMs: Math.round(validator.elapsedMs),
        stdoutSha256: validator.stdoutSha256,
        stderrSha256: validator.stderrSha256,
      },
      testSuite: {
        exitCode: suite.exitCode,
        elapsedMs: Math.round(suite.elapsedMs),
        files: TEST_FILES.length,
        passes,
        failures,
        skips,
        stdoutSha256: suite.stdoutSha256,
        stderrSha256: suite.stderrSha256,
      },
    },
    goldenPlanSweep: {
      decoder: "embedded wasm frame via tests/support/midi-import-test-kit",
      relation: "same-bytes-twice canonical-JSON plan equality",
      cases: sweep,
    },
    findings: findings.list,
  };
  await mkdir(LEDGER_DIR, { recursive: true });
  const temporary = `${LEDGER_PATH}.tmp-${String(process.pid)}`;
  await writeFile(temporary, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  await rename(temporary, LEDGER_PATH);
  process.stdout.write(
    `${JSON.stringify(
      {
        schema: ledger.schema,
        outcome,
        suite: ledger.gates.testSuite,
        familyPins: familyPins.length,
        sweptGoldens: sweep.length,
        ledgerPath: "test-results/m1-evidence/m1-evidence-ledger.json",
        findings: findings.list,
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = outcome === "pass" ? 0 : 1;
}

if (import.meta.main) {
  await main();
}
