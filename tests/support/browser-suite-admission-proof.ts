// Independent process oracles run under real Node. Bun only compiles and
// launches this proof; its child_process/readline shim is not the process oracle.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

const [run, root, baseline, noLock, cachePath, productionRunner] = process.argv.slice(2) as [string, string, string, string, string, string];
const node = { path: process.execPath, version: process.versions.node };
type Event = { event: string; pid: number; parentPid: number; port?: number; title?: string; message?: string };
const cases: { name: string; body(): Promise<void>; timeout: number }[] = [];
function test(name: string, body: () => Promise<void>, timeout: number) { cases.push({ name, body, timeout }); }
function launch(file: string, port: number, mode = "hold", wrapper = false) {
  const signal = resolve(run, `${randomUUID()}.release`);
  const args = [file, String(port), mode, root, signal];
  const process = wrapper ? spawn(node.path, ["-e",
    'require("node:child_process").spawn(process.execPath, process.argv.slice(1), { stdio: "inherit" });', ...args], { stdio: ["pipe", "pipe", "pipe"] }) :
    spawn(node.path, args, { stdio: ["pipe", "pipe", "pipe"] });
  const rows: Event[] = [], errors: string[] = [];
  const lines = createInterface({ input: process.stdout });
  const stream = lines[Symbol.asyncIterator]();
  process.stderr.on("data", (data: Buffer) => { errors.push(data.toString()); });
  const exited = new Promise<number | null>(resolveExit => process.once("exit", resolveExit));
  return {
    process, rows, errors, exited,
    send() { process.stdin.write("continue\n"); },
    async release() { await writeFile(signal, "release"); },
    async next(): Promise<Event> {
      const line = await stream.next();
      if (line.done) throw new Error(`Premature entrant exit: ${errors.join("")}`);
      const row = JSON.parse(line.value) as Event; rows.push(row); return row;
    },
    async save(label: string) { await writeFile(resolve(run, `${label}.json`), JSON.stringify({ node, rows, stderr: errors }, null, 2)); },
    async cleanup() {
      process.stdin.end();
      // Only fixture-owned processes; no foreign process cleanup.
      for (const pid of new Set(rows.filter(row => row.event === "ready").map(row => row.pid))) {
        try { globalThis.process.kill(pid, "SIGTERM"); } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
        }
      }
      if (process.exitCode === null && process.signalCode === null) process.kill();
      await exited; lines.close();
    },
  };
}
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(ready => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("No fixture port");
  await new Promise<void>((done, fail) => server.close(error => { if (error) fail(error); else done(); }));
  return address.port;
}

for (const variant of ["baseline", "no-lock"] as const) test(`two real concurrent entrants: ${variant}`, async () => {
  const port = await freePort(), file = variant === "baseline" ? baseline : noLock;
  const a = launch(file, port), b = launch(file, port);
  try {
    assert.equal((await a.next()).event, "ready"); assert.equal((await b.next()).event, "ready");
    a.send(); b.send();
    const results = [await a.next(), await b.next()];
    const admitted = results.filter(row => row.event === "admitted").length;
    // The same independent mutual-exclusion oracle must kill actual no-lock code.
    const exclusionHolds = admitted === 1 && results.filter(row => row.event === "refused").length === 1;
    assert.equal(exclusionHolds, variant === "baseline");
    assert.equal(admitted, variant === "baseline" ? 1 : 2);
    if (variant === "baseline") assert.equal((results.filter(row => row.event === "refused")).length, 1);
  } finally { await a.save(`${variant}-a`); await b.save(`${variant}-b`); await a.cleanup(); await b.cleanup(); }
}, 20_000);

test("a real browser remains admitted after its outer wrapper is killed", async () => {
  const port = await freePort(), first = launch(baseline, port, "browser", true);
  let second: ReturnType<typeof launch> | undefined;
  try {
    const ready = await first.next(); assert.equal(ready.event, "ready");
    assert.notEqual(ready.pid, first.process.pid);
    first.send(); assert.equal((await first.next()).event, "admitted");
    const browser = await first.next(); assert.equal(browser.event, "browser"); assert.equal(browser.title, "Real admission fixture");
    first.process.kill("SIGKILL"); await first.exited;
    second = launch(baseline, port); assert.equal((await second.next()).event, "ready"); second.send();
    const refused = await second.next(); assert.equal(refused.event, "refused"); assert.ok((refused.message)?.includes("BROWSER_SUITE_BUSY"));
    await first.release(); assert.equal((await first.next()).event, "released");
  } finally {
    await first.save("wrapper-browser"); await first.cleanup();
    if (second) { await second.save("wrapper-contender"); await second.cleanup(); }
  }
}, 30_000);

for (const mode of ["hold", "error"] as const) test(`kernel releases admission on ${mode === "hold" ? "normal exit" : "error exit"}`, async () => {
  const port = await freePort(), first = launch(baseline, port, mode);
  let second: ReturnType<typeof launch> | undefined;
  try {
    await first.next(); first.send(); assert.equal((await first.next()).event, "admitted");
    if (mode === "hold") await first.release();
    assert.equal((await first.next()).event, mode === "hold" ? "released" : "refused");
    assert.equal(await first.exited, mode === "hold" ? 0 : 7);
    second = launch(baseline, port); await second.next(); second.send(); assert.equal((await second.next()).event, "admitted");
  } finally { await first.save(`exit-${mode}`); await first.cleanup(); if (second) { await second.save(`after-${mode}`); await second.cleanup(); } }
}, 20_000);

test("actual old cache-path predicate is rejected against the retained idle-browser witness", async () => {
  // Deterministic process-shaped witness, using exec -a to set argv[0]. It is
  // an idle sleep, never a fabricated browser/suite success. The real browser
  // success twin above uses actual Chromium.
  const witness = spawn("bash", ["-c", "exec -a /tmp/ms-playwright/chromium/chrome sleep 30"], { stdio: "ignore" });
  const child = launch(cachePath, await freePort());
  const control = launch(baseline, await freePort());
  try {
    await control.next(); control.send(); assert.equal((await control.next()).event, "admitted");
    await control.release(); assert.equal((await control.next()).event, "released"); await control.exited;
    await child.next(); child.send(); const result = await child.next();
    assert.equal(result.event, "refused"); assert.ok((result.message)?.includes("BROWSER_SUITE_ACTIVE"));
  } finally { await child.save("cache-path-mutant"); await child.cleanup(); await control.save("cache-path-control"); await control.cleanup(); witness.kill(); }
}, 20_000);

test("two production bootstraps admit exactly one real Playwright CLI suite", async () => {
  const config = resolve(run, "playwright.config.mjs"), report = resolve(run, "playwright.json");
  await writeFile(resolve(run, "admission-native.spec.ts"), `import { test, expect } from "@playwright/test";
    test("actual admitted browser", async ({ page }) => {
      const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
      await page.goto("data:text/html,<title>Production admission</title>");
      expect(await page.title()).toBe("Production admission"); expect(errors).toEqual([]);
    });`);
  await writeFile(config, `export default ${JSON.stringify({ testDir: run, testMatch: "admission-native.spec.ts",
    outputDir: resolve(run, "actual-cli-output"), workers: 1, retries: 0, timeout: 15_000, reporter: [["json", { outputFile: report }]],
    use: { userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0", headless: true } })};`);
  const invoke = async () => {
    const child = spawn(node.path, [productionRunner, resolve(root, "node_modules/@playwright/test/cli.js"), "test", "--config", config],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
    const exit = await new Promise<number | null>(done => child.once("exit", done));
    return { pid: child.pid, exit, stdout, stderr };
  };
  const attempts = await Promise.all([invoke(), invoke()]);
  await writeFile(resolve(run, "actual-cli-entrants.json"), JSON.stringify(attempts, null, 2));
  assert.equal(attempts.filter(row => row.exit === 0).length, 1);
  assert.equal(attempts.filter(row => row.stderr.includes("BROWSER_SUITE_BUSY")).length, 1);
  assert.equal(attempts.filter(row => row.stderr.includes("BROWSER_SUITE_ADMITTED")).length, 1);
  const result = JSON.parse(await readFile(report, "utf8")) as { stats: { expected: number; unexpected: number; skipped: number; flaky: number } };
  assert.deepEqual(result.stats.expected, 1); assert.equal(result.stats.unexpected, 0);
  assert.equal(result.stats.skipped, 0); assert.equal(result.stats.flaky, 0);
}, 30_000);

const results: { name: string; pass: boolean; error?: string }[] = [];
for (const row of cases) {
  // Preserve each declared proof timeout; never continue another browser case
  // if a timed-out body could still own a child.
  const timer = setTimeout(() => {
    process.stderr.write(`Process proof timed out: ${row.name} (${String(row.timeout)}ms)\n`);
    process.exit(1);
  }, row.timeout);
  try { await row.body(); results.push({ name: row.name, pass: true }); }
  catch (error) { results.push({ name: row.name, pass: false, error: error instanceof Error ? error.stack ?? error.message : String(error) }); }
  finally { clearTimeout(timer); }
}
await writeFile(resolve(run, "proof.json"), JSON.stringify({ schema: "changes.browser-suite-admission.v1", node, results }, null, 2));
console.log(JSON.stringify(results));
process.exitCode = results.every(row => row.pass) ? 0 : 1;
