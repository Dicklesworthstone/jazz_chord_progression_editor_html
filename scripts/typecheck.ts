import { runNodeTool } from "./run-node-tool";

const projects = [
  "tsconfig.app.json",
  "tsconfig.tools.json",
  "tsconfig.tests.json",
  "tsconfig.e2e.json",
] as const;

for (const project of projects) {
  const exitCode = await runNodeTool("tsc", [
    "-p",
    project,
    "--noEmit",
    "--pretty",
    "false",
  ]);
  if (exitCode !== 0) {
    process.exitCode = exitCode;
    break;
  }
}
