import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";

const QEMU_SHA256 = "e016785942d935f432db1527472c28288ca324f9c0ca2434084ee61d2d7a59b6";
const BUN_SHA256 = new Set([
  "9fd36f87e4b90b07632b987a2e4ec81ca15a62c81bf983190cea6d715be2ad74",
  "a8f9ebd1770ddc8e55dab7a68d4ec1ec1eebf374bb97cc65cf2c3cb373fc6791",
]);

/** Pin execution tools, never numerical outputs or an acceptance decision. */
export function evidenceEmulatorCommand(qemu: string, entrypoint: string): readonly string[] {
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error("MODEL_EVIDENCE_EMULATOR_PLATFORM: requires Linux x64.");
  }
  if (!isAbsolute(qemu)) {
    throw new Error("MODEL_EVIDENCE_EMULATOR_PATH: provide an absolute qemu-x86_64 path.");
  }
  const digest = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");
  if (digest(qemu) !== QEMU_SHA256) {
    throw new Error("MODEL_EVIDENCE_EMULATOR_DIGEST: QEMU differs from the pinned executable in docs/DEPLOY_GATE.md.");
  }
  if (!BUN_SHA256.has(digest(process.execPath))) {
    throw new Error("MODEL_EVIDENCE_EMULATOR_RUNTIME: requires a pinned official Bun 1.3.14 Linux x64 binary.");
  }
  return Object.freeze([qemu, "-cpu", "max", process.execPath, entrypoint]);
}

export async function runEmulatedEvidence(qemu: string, entrypoint: string): Promise<number> {
  const cmd = evidenceEmulatorCommand(qemu, entrypoint);
  const env = { ...process.env };
  // Only the launcher consumes this option. The child runs every original
  // probe and gate directly, rather than recursively starting another CPU.
  delete env["JCPE_EVIDENCE_QEMU"];
  console.error("Model evidence: pinned QEMU software CPU; complete original gate follows.");
  const child = Bun.spawn({ cmd: [...cmd], env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  const code = await child.exited;
  return child.signalCode === null ? code : 1;
}
