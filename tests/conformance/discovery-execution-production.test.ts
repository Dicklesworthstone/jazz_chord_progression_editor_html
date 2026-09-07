import "./discovery-execution.test";
import { expect, test, setDefaultTimeout } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

setDefaultTimeout(60000);
const root = resolve(import.meta.dirname, "../..");
const output = await mkdtemp(join(tmpdir(), "jcpe-discovery-source-faults-"));
const faults = [
  ["WORK-COUNT", "src/theory/discovery-execution.ts", "tests/unit/discovery-execution.test.ts",
    "workUnits += 1; expandedStates += 1;", "workUnits += 2; expandedStates += 1;", "independent DE-TREE"],
  ["STATE-COUNT", "src/theory/discovery-execution.ts", "tests/unit/discovery-execution.test.ts",
    "workUnits += 1; expandedStates += 1;", "workUnits += 1; expandedStates += 2;", "independent DE-TREE"],
  ["CANDIDATE-COUNT", "src/theory/discovery-execution.ts", "tests/unit/discovery-execution.test.ts",
    "generatedCandidates += 1; offers += 1;", "generatedCandidates += 2; offers += 1;", "independent DE-TREE"],
  ["QUANTUM-COUNT", "src/theory/discovery-execution.ts", "tests/unit/discovery-execution.test.ts",
    "workQuanta: Math.ceil(workUnits / L.workUnitsPerSemanticQuantum)", "workQuanta: workUnits", "independent DE-TREE"],
  ["QUEUE-COUNT", "src/theory/discovery-execution.ts", "tests/unit/discovery-execution.test.ts",
    "Math.max(peakQueuedStates, queuedStates)", "Math.max(peakQueuedStates, queuedStates + 1)", "independent DE-TREE"],
  ["CURSOR-IDENTITY", "src/theory/discovery-execution.ts", "tests/unit/discovery-execution.test.ts",
    "supplied !== cursor", "false", "every quantum/cursor refusal"],
  ["MEMORY-CAP", "src/theory/discovery-arena.ts", "tests/unit/discovery-execution.test.ts",
    "payloadBytes > remaining - DISCOVERY_RESERVATION_OVERHEAD", "false", "zero-sized payloads"],
  ["HANDLE-IDENTITY", "src/theory/discovery-arena.ts", "tests/unit/discovery-execution.test.ts",
    "const bytes = live.get(allocation);", "const bytes = allocation.bytes;", "foreign, copied and double-released handles"],
  ["FINAL-PROPOSAL", "src/application/discovery-execution.ts", "tests/integration/discovery-execution.test.ts",
    "after.canonical !== before.canonical", "false", "a publication adapter that changes its patch"],
  ["PENDING-OWNERSHIP", "src/application/discovery-execution.ts", "tests/integration/discovery-execution.test.ts",
    "job.result = null;\n      if (retiring !== job) release(job);", "job.result = null;\n      release(job);", "cancelled or disposed retirement stays charged"],
  ["SOURCE-SELECTION", "src/application/discovery-binding.ts", "tests/integration/discovery-execution.test.ts",
    "readSelected(event.id) !== source.selectedRealizationId", "false", "selection and engine version changes during retirement"],
  ["SOURCE-CHRONOLOGY", "src/theory/discovery-execution.ts", "tests/conformance/discovery-execution.test.ts",
    "previousEnd !== null && compareBeatValues(position.value, previousEnd) < 0", "false", "pure admission rejects overlapping"],
] as const;

for (const [fault, relativeSource, relativeTest, needle, replacement, pattern] of faults) {
  test(`${fault}: independent assertions reject an actual production source mutation`, async () => {
    const owner = resolve(root, relativeSource), entry = resolve(root, relativeTest);
    const original = await readFile(owner, "utf8");
    expect(original.split(needle)).toHaveLength(2);
    const diagnostics = [];
    for (const variant of ["baseline", "mutant"] as const) {
      const contents = variant === "baseline" ? original : original.replace(needle, replacement);
      const built = await Bun.build({ entrypoints: [entry], target: "bun", external: ["bun:test"], plugins: [{
        name: "discovery-owned-source-fault", setup(builder) {
          builder.onLoad({ filter: /\.(ts|tsx)$/ }, args => args.path === owner ?
            { contents, loader: "ts", resolveDir: dirname(owner) } : undefined);
        },
      }] });
      expect(built.success).toBe(true);
      const artifact = built.outputs[0];
      if (artifact === undefined) throw new Error(`No executable source-fault bundle: ${fault}`);
      const file = join(output, `${fault}-${variant}.test.js`);
      await writeFile(file, await artifact.text());
      const command = [process.execPath, "test", file, "--test-name-pattern", pattern];
      const child = Bun.spawn(command, { cwd: root, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      const log = stdout + stderr, passed = Number(/\n\s+(\d+) pass\n/.exec(log)?.[1] ?? 0);
      const failures = log.match(/\(fail\).*/g) ?? [];
      await writeFile(join(output, `${fault}-${variant}.log`), log);
      diagnostics.push({ fault, variant, source: relativeSource,
        sourceSha256: new Bun.CryptoHasher("sha256").update(contents).digest("hex"),
        test: relativeTest, command, exit, passed, failures });
      await writeFile(join(output, `${fault}.json`), JSON.stringify(diagnostics, null, 2) + "\n");
      expect(variant === "baseline" ? exit === 0 && passed > 0 && failures.length === 0 : exit !== 0 && failures.length > 0).toBe(true);
    }
  });
}
