type Gate = {
  id: string;
  command: string[];
};

const gates: Gate[] = [
  { id: "toolchain", command: [process.execPath, "scripts/toolchain-doctor.ts"] },
  {
    id: "foundation-contract",
    command: [process.execPath, "scripts/validate-f0-contract.ts"],
  },
  {
    id: "f1-domain-contract",
    command: [process.execPath, "scripts/validate-f1-contract.ts"],
  },
  {
    id: "f2-decoder-contract",
    command: [process.execPath, "scripts/validate-f2-contract.ts"],
  },
  {
    id: "t0-syntax-contract",
    command: [process.execPath, "scripts/validate-t0-contract.ts"],
  },
  {
    id: "t1-resolution-contract",
    command: [process.execPath, "scripts/validate-t1-contract.ts"],
  },
  {
    id: "h0-harmony-analysis-contract",
    command: [process.execPath, "scripts/validate-h0-contract.ts"],
  },
  {
    id: "v0-voicing-contract",
    command: [process.execPath, "scripts/validate-v0-contract.ts"],
  },
  {
    id: "v1-voice-assignment-contract",
    command: [process.execPath, "scripts/validate-v1-contract.ts"],
  },
  {
    id: "v2-progression-optimizer-contract",
    command: [process.execPath, "scripts/validate-v2-contract.ts"],
  },
  {
    id: "f3-publication-contract",
    command: [process.execPath, "scripts/validate-f3-contract.ts"],
  },
  {
    id: "p0-playback-plan-contract",
    command: [process.execPath, "scripts/validate-p0-contract.ts"],
  },
  {
    id: "a0-application-contract",
    command: [process.execPath, "scripts/validate-a0-contract.ts"],
  },
  {
    id: "a1-recovery-contract",
    command: [process.execPath, "scripts/validate-a1-contract.ts"],
  },
  {
    id: "a0-u1-atomic-edit-plan-contract",
    command: [
      process.execPath,
      "scripts/validate-a0-u1-edit-plan-contract.ts",
    ],
  },
  {
    id: "u0-ui-contract",
    command: [process.execPath, "scripts/validate-u0-contract.ts"],
  },
  {
    id: "u1-chart-editing-contract",
    command: [process.execPath, "scripts/validate-u1-contract.ts"],
  },
  {
    id: "c0-legacy-migration-contract",
    command: [process.execPath, "scripts/validate-c0-contract.ts"],
  },
  {
    id: "e0-interchange-contract",
    command: [process.execPath, "scripts/validate-e0-contract.ts"],
  },
  {
    id: "e1-midi-export-contract",
    command: [process.execPath, "scripts/validate-e1-contract.ts"],
  },
  {
    id: "m0-midi-import-contract",
    command: [process.execPath, "scripts/validate-m0-contract.ts"],
  },
  {
    id: "m0-evidence",
    command: [process.execPath, "scripts/verify-m0-evidence.ts"],
  },
  {
    id: "m1-midi-import-automation-contract",
    command: [process.execPath, "scripts/validate-m1-contract.ts"],
  },
  {
    id: "m1-evidence",
    command: [process.execPath, "scripts/verify-m1-evidence.ts"],
  },
  {
    id: "a0-e0-owner-bridge-contract",
    command: [process.execPath, "scripts/validate-a0-e0-bridge-contract.ts"],
  },
  {
    id: "a0-e0-bridge-evidence",
    command: [process.execPath, "scripts/verify-bridge-evidence.ts"],
  },
  {
    id: "e0-v2-interchange-contract",
    command: [process.execPath, "scripts/validate-e0-v2-contract.ts"],
  },
  {
    id: "x0-audio-engine-contract",
    command: [process.execPath, "scripts/validate-x0-contract.ts"],
  },
  {
    id: "phs0-physical-renderer-contract",
    command: [process.execPath, "scripts/validate-phs0-contract.ts"],
  },
  {
    id: "phs1-offline-foundry-contract",
    command: [process.execPath, "scripts/validate-phs1-contract.ts"],
  },
  {
    id: "x1-transport-contract",
    command: [process.execPath, "scripts/validate-x1-contract.ts"],
  },
  { id: "typecheck", command: [process.execPath, "scripts/typecheck.ts"] },
  { id: "lint", command: [process.execPath, "scripts/lint.ts"] },
  { id: "bun-tests", command: [process.execPath, "test"] },
  { id: "build", command: [process.execPath, "scripts/build.ts"] },
  {
    id: "f1-evidence",
    command: [process.execPath, "scripts/verify-f1-evidence.ts"],
  },
  {
    id: "f2-evidence",
    command: [process.execPath, "scripts/verify-f2-evidence.ts"],
  },
  {
    id: "t0-evidence",
    command: [process.execPath, "scripts/verify-t0-evidence.ts"],
  },
  {
    id: "t1-evidence",
    command: [process.execPath, "scripts/verify-t1-evidence.ts"],
  },
  {
    id: "v0-evidence",
    command: [process.execPath, "scripts/verify-v0-evidence.ts"],
  },
  {
    id: "v1-evidence",
    command: [process.execPath, "scripts/verify-v1-evidence.ts"],
  },
  {
    id: "v2-evidence",
    command: [process.execPath, "scripts/verify-v2-evidence.ts"],
  },
  {
    id: "f3-evidence",
    command: [process.execPath, "scripts/verify-f3-evidence.ts"],
  },
  {
    id: "p0-evidence",
    command: [process.execPath, "scripts/verify-p0-evidence.ts"],
  },
  {
    id: "e1-evidence",
    command: [process.execPath, "scripts/verify-e1-evidence.ts"],
  },
  {
    id: "a0-evidence",
    command: [process.execPath, "scripts/verify-a0-evidence.ts"],
  },
  {
    id: "u0-evidence",
    command: [process.execPath, "scripts/verify-u0-evidence.ts"],
  },
  {
    id: "c0-evidence",
    command: [process.execPath, "scripts/verify-c0-evidence.ts"],
  },
  {
    id: "x0-evidence",
    command: [process.execPath, "scripts/verify-x0-evidence.ts"],
  },
  {
    id: "standalone-static",
    command: [process.execPath, "scripts/verify-standalone.ts", "--static-only"],
  },
  {
    id: "reproducible",
    command: [process.execPath, "scripts/verify-reproducible.ts"],
  },
  {
    id: "licenses",
    command: [process.execPath, "scripts/verify-licenses.ts"],
  },
  {
    id: "e2e",
    command: [process.execPath, "scripts/run-playwright.ts", "test"],
  },
  {
    id: "f0-evidence",
    command: [process.execPath, "scripts/verify-f0-evidence.ts"],
  },
];

const completed: string[] = [];
for (const gate of gates) {
  console.log(`[verify] ${gate.id}`);
  const child = Bun.spawn({
    cmd: gate.command,
    cwd: process.cwd(),
    env: process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    console.error(
      JSON.stringify(
        {
          schema: "jcpe.verify.v1",
          outcome: "fail",
          failedGate: gate.id,
          exitCode,
          completed,
        },
        null,
        2,
      ),
    );
    process.exit(exitCode);
  }
  completed.push(gate.id);
}

console.log(
  JSON.stringify(
    {
      schema: "jcpe.verify.v1",
      outcome: "pass",
      completed,
    },
    null,
    2,
  ),
);
