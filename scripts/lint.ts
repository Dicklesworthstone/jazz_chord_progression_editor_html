import { runNodeTool } from "./run-node-tool";

const policy = Bun.spawn({
  cmd: [process.execPath, "scripts/source-policy.ts"],
  cwd: process.cwd(),
  env: process.env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
const policyExit = await policy.exited;
if (policyExit !== 0) {
  process.exitCode = policyExit;
} else {
  process.exitCode = await runNodeTool("eslint", [".", "--max-warnings", "0"]);
}
