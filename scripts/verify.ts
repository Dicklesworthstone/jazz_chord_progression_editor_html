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
  { id: "typecheck", command: [process.execPath, "scripts/typecheck.ts"] },
  { id: "lint", command: [process.execPath, "scripts/lint.ts"] },
  { id: "bun-tests", command: [process.execPath, "test"] },
  {
    id: "f1-evidence",
    command: [process.execPath, "scripts/verify-f1-evidence.ts"],
  },
  { id: "build", command: [process.execPath, "scripts/build.ts"] },
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
