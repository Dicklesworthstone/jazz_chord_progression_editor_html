import { expect, test } from "bun:test";
import { evidenceEmulatorCommand } from "../../scripts/evidence-emulator";

const supportedPlatform = process.platform === "linux" && process.arch === "x64";

test("an empty or relative emulator path cannot launch a replacement gate", () => {
  for (const path of ["", "qemu-x86_64", "./qemu-x86_64"]) {
    expect(() => evidenceEmulatorCommand(path, "/gate.ts"))
      .toThrow(supportedPlatform ? "MODEL_EVIDENCE_EMULATOR_PATH" : "MODEL_EVIDENCE_EMULATOR_PLATFORM");
  }
});

test("a present but unpinned executable cannot stand in for QEMU", () => {
  expect(() => evidenceEmulatorCommand(process.execPath, "/gate.ts"))
    .toThrow(supportedPlatform ? "MODEL_EVIDENCE_EMULATOR_DIGEST" : "MODEL_EVIDENCE_EMULATOR_PLATFORM");
});

test("a missing emulator fails without falling back to native execution", () => {
  expect(() => evidenceEmulatorCommand("/nonexistent-jcpe-evidence-emulator/qemu-x86_64", "/gate.ts"))
    .toThrow();
});
