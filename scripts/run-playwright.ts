import { randomUUID } from "node:crypto";
import { mergeBrowserEvidence } from "./merge-browser-evidence";
import { runNodeTool } from "./run-node-tool";

const args = Bun.argv.slice(2);
const isTest = args[0] === "test";
const namedSpecs = args.filter((argument) => argument.endsWith(".spec.ts"));
const collectsStandaloneEvidence =
  isTest &&
  (namedSpecs.length === 0 ||
    namedSpecs.some((argument) => argument.endsWith("standalone-offline.spec.ts")));

if (!collectsStandaloneEvidence) {
  process.exitCode = await runNodeTool("playwright", args);
} else {
  const runId = randomUUID();
  process.env["JCPE_E2E_RUN_ID"] = runId;
  const testExitCode = await runNodeTool("playwright", args);
  let mergeExitCode: number;
  try {
    mergeExitCode = (await mergeBrowserEvidence(runId)).exitCode;
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Browser evidence merge failed.",
    );
    mergeExitCode = 2;
  }
  process.exitCode = testExitCode === 0 ? mergeExitCode : testExitCode;
}
