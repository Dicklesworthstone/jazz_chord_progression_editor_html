import { assertBrowserLaneFree } from "./browser-suite-admission";
import { randomUUID } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { atomicWrite, sha256Hex, stableJson } from "./foundation-io";
import { findRealNode } from "./toolchain-doctor";

const root = resolve(import.meta.dirname, "..");
const runId = randomUUID();
const directory = resolve(root, "test-results/discovery-execution-runs", runId);
const namedTests = ["tests/unit/discovery-execution.test.ts", "tests/integration/discovery-execution.test.ts",
  "tests/static/discovery-execution-contract.test.ts", "tests/conformance/discovery-execution-production.test.ts",
  "tests/property/discovery-execution-laws.test.ts"];
const faults = ["WORK-COUNT", "STATE-COUNT", "CANDIDATE-COUNT", "QUANTUM-COUNT", "QUEUE-COUNT", "CURSOR-IDENTITY",
  "MEMORY-CAP", "HANDLE-IDENTITY", "FINAL-PROPOSAL", "PENDING-OWNERSHIP", "SOURCE-SELECTION", "SOURCE-CHRONOLOGY"];
const scenarios = ["apply-undo", "edit-during-search", "stop-during-search", "edit-during-retirement", "stop-during-retirement"];
const browsers = ["chromium", "firefox", "webkit"];
const commands: { command: string[]; exitCode: number; log: string; sha256: string }[] = [];
type Input = Readonly<{ path: string; bytes: number; mtimeMs: number; sha256: string }>;
let before: Input[] = [], after: Input[] = [], bundleSha256 = "", inputDigest = "";
const findings: string[] = [];

function requireTrue(value: boolean, message: string): asserts value {
  if (!value) throw new Error(message);
}
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected evidence object");
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Expected evidence array");
  return value;
}
function at(value: unknown, ...path: string[]): unknown {
  for (const key of path) value = object(value)[key];
  return value;
}
const json = async (path: string): Promise<unknown> => await Bun.file(path).json();
async function paths(): Promise<string[]> {
  const result = new Set<string>(["node_modules/@playwright/test/package.json", "node_modules/playwright-core/package.json",
    "node_modules/playwright-core/lib/coreBundle.js"]);
  for (const pattern of ["src/**/*", "tests/**/*", "scripts/**/*", "docs/**/*", "*.json", "*.ts", "*.mjs", "*.md", "bun.lock"]) {
    for await (const path of new Bun.Glob(pattern).scan({ cwd: root, onlyFiles: true })) result.add(path);
  }
  return [...result].sort();
}
async function snapshot(inputPaths: readonly string[]): Promise<Input[]> {
  const result: Input[] = [];
  for (const path of inputPaths) {
    const file = resolve(root, path), metadata = await stat(file);
    const bytes = new Uint8Array(await Bun.file(file).arrayBuffer());
    result.push({ path, bytes: bytes.length, mtimeMs: metadata.mtimeMs, sha256: await sha256Hex(bytes) });
  }
  return result;
}
async function command(id: string, args: string[]): Promise<string> {
  console.log(`Discovery evidence: ${id}`);
  const child = Bun.spawn(args, { cwd: root, env: { ...process.env,
    JCPE_DISCOVERY_RUN_ID: runId, JCPE_DISCOVERY_BUNDLE_SHA256: bundleSha256,
    JCPE_DISCOVERY_INPUT_DIGEST: inputDigest, JCPE_DISCOVERY_MUTATION_OUTPUT: resolve(directory, "mutants") }, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  const log = stdout + stderr, path = resolve(directory, `${id}.log`);
  await atomicWrite(path, log);
  commands.push({ command: args, exitCode, log: relative(root, path), sha256: await sha256Hex(log) });
  requireTrue(exitCode === 0, `${id} failed (${String(exitCode)}); see ${path}`);
  return log;
}
async function bundle() {
  const result = await Bun.build({ entrypoints: [resolve(root, "tests/e2e/discovery-execution-harness.ts")],
    target: "browser", format: "iife", packages: "bundle", splitting: false, minify: false, sourcemap: "none", metafile: true });
  requireTrue(result.success && result.metafile !== undefined, `Harness failed: ${result.logs.map(row => row.message).join("\n")}`);
  const artifact = result.outputs[0];
  requireTrue(artifact !== undefined && result.outputs.length === 1 && artifact.kind === "entry-point", "Harness must be one script");
  requireTrue(Object.values(result.metafile.outputs).every(row => row.imports.length === 0), "External harness import");
  return { source: await artifact.text(), inputs: Object.keys(result.metafile.inputs).sort() };
}
async function inspectBrowserEvidence(): Promise<number> {
  const report = await json(resolve(directory, "playwright-results.json")), stats = object(at(report, "stats"));
  requireTrue(stats["expected"] === 30 && stats["unexpected"] === 0 && stats["flaky"] === 0 && stats["skipped"] === 0,
    "Native matrix must have 30 expected, zero unexpected/flaky/skipped results");
  requireTrue(array(at(report, "errors")).length === 0, "Playwright global error");
  let results = 0;
  const inspectSuite = (value: unknown): void => {
    // Playwright omits this property on leaf suites, rather than writing [].
    for (const child of array(at(value, "suites") ?? [])) inspectSuite(child);
    for (const spec of array(at(value, "specs"))) {
      requireTrue(at(spec, "ok") === true, "Unexpected native spec result");
      for (const test of array(at(spec, "tests"))) {
        const outcomes = array(at(test, "results"));
        requireTrue(outcomes.length === 1 && at(test, "status") === "expected", "Retried or unexpected native test");
        for (const result of outcomes) {
          requireTrue(at(result, "status") === "passed" && at(result, "retry") === 0 && array(at(result, "errors")).length === 0, "Native test did not pass once"); results += 1;
        }
      }
    }
  };
  for (const suite of array(at(report, "suites"))) inspectSuite(suite);
  requireTrue(results === 30, "Missing native result rows");
  const expected = new Set(browsers.flatMap(browser => [1280, 390].flatMap(width => scenarios.map(scenario => `${browser}/${String(width)}/${scenario}`))));
  for await (const path of new Bun.Glob("browser-artifacts/**/observations.json").scan({ cwd: directory })) {
    const evidence = await json(resolve(directory, path));
    const key = `${String(at(evidence, "browserName"))}/${String(at(evidence, "viewport", "width"))}/${String(at(evidence, "scenario"))}`;
    requireTrue(expected.delete(key), `Unexpected/duplicate native trace: ${key}`);
    requireTrue(at(evidence, "runId") === runId && at(evidence, "inputDigest") === inputDigest && at(evidence, "bundleSha256") === bundleSha256, `Unbound trace ${key}`);
    requireTrue(at(evidence, "retry") === 0 && /^v(?:22|24|26)\./u.test(String(at(evidence, "nodeVersion"))), `Invalid retry/runtime ${key}`);
    requireTrue(typeof at(evidence, "browserVersion") === "string" && String(at(evidence, "browserVersion")).length > 0, "Missing browser version");
    requireTrue(array(at(evidence, "pageErrors")).length === 0, `Page errors: ${key}`);
    requireTrue(array(at(evidence, "consoleMessages")).every(row => !["error", "warning"].includes(String(at(row, "type")))), `Console errors: ${key}`);
    const requests = array(at(evidence, "requests"));
    requireTrue(requests.length === 1 && at(requests[0], "method") === "GET" && at(requests[0], "url") === "https://discovery.evidence.localhost/" &&
      at(requests[0], "userAgent") === "OpenAI File Downloader, XaiImageApiFetch/1.0", `Unexpected request: ${key}`);
    const observations = array(at(evidence, "observations"));
    const phase = (name: string): unknown => {
      const rows = observations.filter(row => at(row, "phase") === name); requireTrue(rows.length === 1, `Missing/duplicate ${name}: ${key}`);
      return at(rows[0], "actual");
    };
    const beforeState = phase("before"), playing = phase("playing"), final = phase("final"), disposed = phase("disposed");
    requireTrue(Number(at(playing, "audio", "engine", "progressionNonreleasingVoiceCount")) > 0 &&
      Number(at(playing, "audio", "engine", "previewNonreleasingVoiceCount")) > 0, `No actual simultaneous audio voices: ${key}`);
    for (const row of observations) requireTrue(array(at(row, "actual", "errors")).length === 0, `Harness error: ${key}`);
    for (const name of ["progressionNonreleasingVoiceCount", "previewNonreleasingVoiceCount"]) requireTrue(at(final, "audio", "engine", name) === 0, `Unretired voice: ${key}`);
    requireTrue(at(final, "exportRevision") === 4 && stableJson(at(final, "recovery")) === stableJson(at(beforeState, "recovery")), `Changed marker: ${key}`);
    requireTrue(array(at(final, "pendingRequests")).length === 0 && at(final, "job", "publicationAttempts") === 0 && at(final, "job", "scheduledCallbacks") === 0, `Pending authority: ${key}`);
    for (const name of ["contextListeners", "messagePorts", "messageHandlers", "intervals", "uiListeners"]) requireTrue(at(disposed, "native", name) === 0, `Leaked native ${name}: ${key}`);
    for (const name of ["listeners", "retainedBytes", "publicationAttempts", "scheduledCallbacks"]) requireTrue(at(disposed, "job", name) === 0, `Leaked job ${name}: ${key}`);
    requireTrue(at(disposed, "audio", "transport", "state") === "disposed" && at(disposed, "audio", "engine", "retainedVoiceCount") === 0, `Audio disposal failed: ${key}`);
    requireTrue(at(disposed, "audio", "engine", "contextState") === "closed" && at(disposed, "audio", "engine", "persistentEdgeCount") === 0 &&
      at(disposed, "audio", "engine", "registryIndexCounts", "totalReferences") === 0, `Live context/graph/voice registry after disposal: ${key}`);
    const scenario = String(at(evidence, "scenario"));
    if (scenario.endsWith("during-search")) {
      requireTrue(at(phase("busy"), "inputWhileBusy") === true && Number(at(phase("search-ended"), "expansions")) < 16384, `Search did not yield: ${key}`);
      requireTrue(at(phase("search-ended"), "startResult", "result", "kind") === (scenario.startsWith("edit") ? "stale" : "cancelled"), `Search terminal mismatch: ${key}`);
    } else {
      requireTrue(at(phase("ready"), "expansions") === 3 && at(phase("ready"), "startResult", "result", "kind") === "complete", `Finite workload mismatch: ${key}`);
      requireTrue(at(phase("apply-ended"), "applyResult", "kind") === (scenario === "apply-undo" ? "committed" : scenario.startsWith("edit") ? "stale" : "cancelled"), `Apply terminal mismatch: ${key}`);
      if (scenario === "apply-undo") requireTrue(at(phase("undone"), "documentBytes") === at(beforeState, "documentBytes") && at(final, "revision") === 7 && at(final, "historyEntries") === 2, `Undo failed: ${key}`);
      else requireTrue(at(phase("retirement-held"), "job", "publicationAttempts") === 1 && Number(at(phase("retirement-held"), "job", "retainedBytes")) > 0, `Missing owned retirement: ${key}`);
    }
    const journal = array(at(disposed, "transport"));
    requireTrue(journal.length >= 5 && journal.every(row => at(row, "outcome", "termination") === "receipt"), `Native transport refusal: ${key}`);
    for (const row of journal.filter(row => ["apply-retirement", "user-stop"].includes(String(at(row, "action"))))) {
      requireTrue(at(row, "outcome", "noFutureAttackPostcondition") === true, `Retirement postcondition failed: ${key}`);
    }
  }
  requireTrue(expected.size === 0, `Missing native observations: ${[...expected].join(", ")}`);
  return results;
}

await mkdir(directory, { recursive: true });
let browserResults = 0, outcome = "fail";
try {
  requireTrue(Bun.version === "1.3.14", "Use Bun 1.3.14");
  await assertBrowserLaneFree();
  const discovered = await bundle();
  const declared = [...new Set([...(await paths()), ...discovered.inputs])].sort();
  before = await snapshot(declared); inputDigest = await sha256Hex(stableJson(before));
  await atomicWrite(resolve(directory, "inputs-before.json"), stableJson({ inputDigest, inputs: before }));
  for (const path of [...namedTests, "tests/conformance/discovery-execution.test.ts", "tests/property/discovery-execution.test.ts", "tests/e2e/discovery-execution.spec.ts"]) {
    requireTrue(!/\b(?:test|describe)\.(?:skip|todo|only)\s*\(/u.test(await Bun.file(resolve(root, path)).text()), `Skipped/only/todo inventory: ${path}`);
  }
  const built = await bundle();
  requireTrue(stableJson(built.inputs) === stableJson(discovered.inputs), "Bundle dependency set changed");
  bundleSha256 = await sha256Hex(built.source);
  await atomicWrite(resolve(directory, "harness.js"), built.source);
  const node = await findRealNode();
  await atomicWrite(resolve(directory, "runtime.json"), stableJson({ bunVersion: Bun.version, node,
    playwright: await json(resolve(root, "node_modules/@playwright/test/package.json")), bundleSha256, inputDigest, seed: null,
    scope: "Finite generic protocol workload; musical engines, discovery product UI and human listening are not certified." }));
  await command("contract", [process.execPath, "scripts/validate-discovery-execution-contract.ts"]);
  const log = await command("production", [process.execPath, "test", ...namedTests]);
  requireTrue(/\n\s+122 pass\n/u.test(log) && /\n\s+0 fail\n/u.test(log) && !/\n\s+[1-9]\d* (?:skip|todo)/u.test(log), "Expected exactly 122 passing production tests and no skips/todos/failures");
  for (const fault of faults) {
    const pair = array(await json(resolve(directory, "mutants", `${fault}.json`)));
    requireTrue(pair.length === 2, `Missing mutation pair: ${fault}`);
    const [baseline, mutant] = pair;
    requireTrue(at(baseline, "variant") === "baseline" && at(baseline, "exit") === 0 && Number(at(baseline, "passed")) > 0 && array(at(baseline, "failures")).length === 0, `Invalid mutation baseline: ${fault}`);
    requireTrue(at(mutant, "variant") === "mutant" && Number(at(mutant, "exit")) > 0 && array(at(mutant, "failures")).length > 0 && at(mutant, "sourceSha256") !== at(baseline, "sourceSha256"), `Surviving/non-source mutation: ${fault}`);
  }
  await command("browser", [process.execPath, "scripts/run-playwright.ts", "test", "--config", "playwright.discovery.config.ts", "tests/e2e/discovery-execution.spec.ts"]);
  browserResults = await inspectBrowserEvidence();
  after = await snapshot(declared);
  requireTrue(stableJson(before) === stableJson(after), "Declared inputs changed during evidence execution");
  requireTrue(stableJson(await paths()) === stableJson(declared), "Declared source set changed");
  outcome = "pass";
} catch (error) {
  findings.push(error instanceof Error ? error.message : String(error));
} finally {
  if (before.length > 0 && after.length === 0) after = await snapshot(before.map(row => row.path));
  await atomicWrite(resolve(directory, "inputs-after.json"), stableJson({ inputs: after }));
  const evidence = { schema: "changes.evidence.discovery-execution.v1", runId, outcome, inputDigest, bundleSha256,
    inputCount: before.length, inputsStable: stableJson(before) === stableJson(after), browserResults, commands, findings,
    independentSourceMutations: faults.length, runDirectory: relative(root, directory),
    scope: "Shared finite protocol only; engine and musician-workflow proofs retain their own gates." };
  await atomicWrite(resolve(directory, "evidence.json"), stableJson(evidence));
  await atomicWrite(resolve(root, "test-results/discovery-execution-evidence.json"), stableJson(evidence));
  console.log(stableJson(evidence));
  process.exitCode = outcome === "pass" ? 0 : 1;
}
