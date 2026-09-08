import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { findRealNode } from "./toolchain-doctor";

const TOOL_ENTRYPOINTS = {
  eslint: "node_modules/eslint/bin/eslint.js",
  playwright: "node_modules/@playwright/test/cli.js",
  tsc: "node_modules/typescript/bin/tsc",
} as const;

export type NodeTool = keyof typeof TOOL_ENTRYPOINTS;

export async function runNodeTool(
  tool: NodeTool,
  args: readonly string[],
): Promise<number> {
  const runtime = await findRealNode();
  const entrypoint = TOOL_ENTRYPOINTS[tool];
  if (!(await Bun.file(entrypoint).exists())) {
    throw new Error(
      `NODE_TOOL_MISSING: ${entrypoint}; run bun install --frozen-lockfile.`,
    );
  }
  let launch = [runtime.path, entrypoint, ...args];
  if (tool === "playwright" && args[0] === "test") {
    const built = await Bun.build({ entrypoints: [resolve(import.meta.dirname, "browser-suite-runner.ts")],
      target: "node", format: "esm", packages: "external", minify: false, sourcemap: "none" });
    const output = built.outputs[0];
    if (!built.success || built.outputs.length !== 1 || output === undefined) {
      throw new Error(`BROWSER_SUITE_BUILD: ${built.logs.map(log => log.message).join("\n")}`);
    }
    // Keep the exact launcher outside Playwright's default output cleanup. Unique directories avoid
    // concurrent writers and remain ignored; no shared source file is rewritten.
    await mkdir(".tmp", { recursive: true });
    const directory = await mkdtemp(resolve(".tmp/browser-suite-runner-"));
    const runner = resolve(directory, "runner.mjs");
    await writeFile(runner, await output.text());
    launch = [runtime.path, runner, resolve(entrypoint), ...args];
  }
  const child = Bun.spawn({
    cmd: launch,
    cwd: process.cwd(),
    env: process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  return await child.exited;
}

if (import.meta.main) {
  const [rawTool, ...args] = Bun.argv.slice(2);
  if (!rawTool || !(rawTool in TOOL_ENTRYPOINTS)) {
    console.error(
      `Usage: bun scripts/run-node-tool.ts <${Object.keys(TOOL_ENTRYPOINTS).join(
        "|",
      )}> [args...]`,
    );
    process.exitCode = 2;
  } else {
    try {
      process.exitCode = await runNodeTool(rawTool as NodeTool, args);
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Node tool failed.");
      process.exitCode = 2;
    }
  }
}
