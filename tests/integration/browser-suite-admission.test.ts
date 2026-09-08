import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { findRealNode } from "../../scripts/toolchain-doctor";

const root = resolve(import.meta.dirname, "../..");
const evidence = resolve(root, ".tmp/jcpe-admission-recovery/evidence");
await mkdir(evidence, { recursive: true });
const run = await mkdtemp(resolve(evidence, "process-run-"));
const node = await findRealNode();
const entry = resolve(root, "tests/fixtures/browser-suite-admission/entrant.ts");
const admission = resolve(root, "scripts/browser-suite-admission.ts");
const source = await readFile(admission, "utf8");

async function compile(variant: "baseline" | "no-lock" | "cache-path"): Promise<string> {
  const replacement = variant === "no-lock" ? source.replace('server.listen({ port, host:', 'server.listen({ port: 0, host:') :
    variant === "cache-path" ? source.replace('const executable = basename(argv[0] ?? "");', 'if (argv.join(" ").includes("playwright")) return true;\n  const executable = basename(argv[0] ?? "");') : source;
  if (variant !== "baseline") expect(replacement).not.toBe(source);
  const result = await Bun.build({ entrypoints: [entry], target: "node", format: "esm", packages: "external",
    plugins: [{ name: "actual-source-admission-variant", setup(build) {
      build.onLoad({ filter: /browser-suite-admission\.ts$/u }, () => ({ contents: replacement, loader: "ts", resolveDir: resolve(root, "scripts") }));
    } }] });
  const output = result.outputs[0];
  if (!result.success || output === undefined) throw new Error(result.logs.map(log => log.message).join("\n"));
  const file = resolve(run, `${variant}.mjs`);
  await writeFile(file, await output.text());
  await writeFile(resolve(run, `${variant}.source-sha256`), new Bun.CryptoHasher("sha256").update(replacement).digest("hex"));
  return file;
}
const baseline = await compile("baseline");

test("real Node process/browser admission proof and both actual source mutants", async () => {
  const noLock = await compile("no-lock"), cachePath = await compile("cache-path");
  const proof = await Bun.build({ entrypoints: [resolve(root, "tests/support/browser-suite-admission-proof.ts")], target: "node", format: "esm", packages: "external" });
  const output = proof.outputs[0];
  if (!proof.success || output === undefined) throw new Error(proof.logs.map(log => log.message).join("\n"));
  const file = resolve(run, "proof.mjs"); await writeFile(file, await output.text());
  const runnerBuild = await Bun.build({ entrypoints: [resolve(root, "scripts/browser-suite-runner.ts")], target: "node", format: "esm", packages: "external" });
  const runnerOutput = runnerBuild.outputs[0];
  if (!runnerBuild.success || runnerOutput === undefined) throw new Error("Production admission runner build failed");
  const runner = resolve(run, "production-runner.mjs"); await writeFile(runner, await runnerOutput.text());
  const child = Bun.spawn([node.path, file, run, root, baseline, noLock, cachePath, runner], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  await writeFile(resolve(run, "native-proof.log"), stdout + stderr);
  const result = JSON.parse(await readFile(resolve(run, "proof.json"), "utf8")) as { results: { name: string; pass: boolean; error?: string }[] };
  expect(result.results).toHaveLength(7);
  for (const row of result.results) expect({ name: row.name, pass: row.pass, error: row.error }).toEqual({ name: row.name, pass: true, error: undefined });
  expect(code).toBe(0);
}, 60_000);
