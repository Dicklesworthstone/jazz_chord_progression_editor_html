import { randomUUID } from "node:crypto";
import { mergeBrowserEvidence } from "./merge-browser-evidence";
import { runNodeTool } from "./run-node-tool";

const args = Bun.argv.slice(2);
const isTest = args[0] === "test";

/*
 * Headless Firefox needs a real audio backend: on a device-less Linux host
 * its AudioContext.resume() never resolves (no error, no console output —
 * the transport just holds "Starting playback" forever), which is exactly
 * how three real-audio specs failed on the first full matrix run of this
 * box (jcpe-e2e-regression-cluster-fitz). Chromium and WebKit fake an
 * output device; Firefox does not. A PulseAudio null sink cures it, so the
 * runner ensures one best-effort and WARNS when it cannot — the affected
 * specs then fail with this explanation on record instead of a mystery.
 */
if (isTest && process.platform === "linux") {
  const probe = Bun.spawnSync(["pactl", "info"], { stdout: "ignore", stderr: "ignore" });
  if (probe.exitCode !== 0) {
    const started = Bun.spawnSync(
      ["pulseaudio", "--start", "--exit-idle-time=-1"],
      { stdout: "ignore", stderr: "ignore" },
    );
    if (started.exitCode === 0) {
      Bun.spawnSync(
        ["pactl", "load-module", "module-null-sink", "sink_name=jcpe_null"],
        { stdout: "ignore", stderr: "ignore" },
      );
    } else {
      console.error(
        "WARNING: no audio server and pulseaudio unavailable — headless " +
          "Firefox AudioContext.resume() will hang and its real-audio specs " +
          "will fail (install pulseaudio + pulseaudio-utils).",
      );
    }
  }
}
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
