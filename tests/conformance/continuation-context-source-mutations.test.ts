import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "../..");
const entry = resolve(root, "tests/unit/continuation-context-regression.test.ts");
const output = await mkdtemp(join(tmpdir(), "jcpe-continuation-context-faults-"));
const faults = [
  ["FALSE-CONTAINMENT", "src/theory/continuation.ts", "completePitchClassContainment: pitchClassMatches === tones.length,", "completePitchClassContainment: true,", "independent containment evidence SS-STARTER-COUNTEREXAMPLE"],
  ["COUNTEREVIDENCE", "src/theory/continuation.ts", "tones.filter(tone => !tone.pitchClassContained)", "tones.filter(() => false)", "starter counterevidence and double-sharp distinctions"],
  ["FIRST-REALIZATION", "src/theory/continuation.ts", ": resolved.value.realizations.find(row => row.id === selected);", ": resolved.value.realizations[0];", "selected altered realization changes actual tones"],
  ["DROPPED-BARRIER", "src/theory/continuation.ts", "facts.length = 0;", "/* Source fault: retain the prefix across a barrier. */", "custom and unsupported chords break context"],
  ["STALE-CACHE", "src/application/studio-controller.ts", "if (cached !== undefined && cached.eventIds.every((id, index) =>\n      (selectedRealizations?.get(id) ?? null) === cached.selections[index])) return cached.view;", "if (cached !== undefined) return cached.view;", "actual controller changes selection evidence"],
] as const;

for (const [id, relativeSource, needle, replacement, assertion] of faults) {
  test(`${id}: actual production fault fails the unchanged musical assertion`, async () => {
    const owner = resolve(root, relativeSource), original = await readFile(owner, "utf8");
    expect(original.split(needle)).toHaveLength(2);
    const reports = [];
    for (const variant of ["baseline", "mutant"] as const) {
      const contents = variant === "baseline" ? original : original.replace(needle, replacement);
      const built = await Bun.build({ entrypoints: [entry], target: "bun", external: ["bun:test"], plugins: [{
        name: "continuation-context-source-fault", setup(builder) {
          builder.onLoad({ filter: /\.(ts|tsx)$/u }, args => args.path === owner
            ? { contents, loader: "ts", resolveDir: dirname(owner) } : undefined);
        },
      }] });
      expect(built.success).toBe(true);
      const artifact = built.outputs[0]; if (artifact === undefined) throw new Error("Missing source-fault bundle");
      const file = join(output, `${id}-${variant}.test.js`);
      await writeFile(file, await artifact.text());
      const command = [process.execPath, "test", file];
      const child = Bun.spawn(command, { cwd: root, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      const log = stdout + stderr, passed = Number(/\n\s+(\d+) pass\n/u.exec(log)?.[1] ?? 0);
      const failed = Number(/\n\s+(\d+) fail\n/u.exec(log)?.[1] ?? 0);
      const failures = log.match(/\(fail\).*/gu) ?? [];
      const report = { id, variant, source: relativeSource, sourceSha256: new Bun.CryptoHasher("sha256").update(contents).digest("hex"),
        assertion, command, passed, failed, failures, exit };
      reports.push(report);
      await writeFile(join(output, `${id}-${variant}.log`), log);
      await writeFile(join(output, `${id}.json`), JSON.stringify(reports, null, 2) + "\n");
      expect(passed + failed).toBe(23);
      expect(log).not.toMatch(/\n\s+[1-9]\d* (skip|todo)\n/u);
      if (variant === "baseline") { expect(exit).toBe(0); expect(failed).toBe(0); }
      else { expect(exit).not.toBe(0); expect(failures.some(line => line.includes(assertion))).toBe(true); }
    }
    expect(reports[0]?.sourceSha256).not.toBe(reports[1]?.sourceSha256);
  });
}
