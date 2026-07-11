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
  const child = Bun.spawn({
    cmd: [runtime.path, entrypoint, ...args],
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
