import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "../..");
const entry = resolve(root, "tests/unit/studio-realization-playback-memo.test.ts");
const output = await mkdtemp(join(tmpdir(), "jcpe-realization-memo-faults-"));
const source = "src/application/studio-realization.ts";
const comparison = "documentsSemanticallyEqual({ ...document, playback: previous.playback }, previous)";
const faults = [
  ["NO-PLAYBACK-REUSE", source, comparison, "false", "playback-only publication reuses the exact auto realization"],
  ["STALE-SOURCE-REUSE", source, comparison, "true", "a source edit with the same IDs cannot reuse old pitches"],
  ["LOSSY-JSON-REUSE", source, comparison,
    "JSON.stringify({ ...document, playback: previous.playback }) === JSON.stringify(previous)",
    "manual pitches retain negative zero, order and duplicate unisons"],
] as const;

for (const [id, relativeSource, needle, replacement, assertion] of faults) {
  test(`${id}: actual production fault fails the unchanged musical assertion`, async () => {
    const owner = resolve(root, relativeSource), original = await readFile(owner, "utf8");
    expect(original.split(needle)).toHaveLength(2);
    const reports = [];
    for (const variant of ["baseline", "mutant"] as const) {
      const contents = variant === "baseline" ? original : original.replace(needle, replacement);
      const built = await Bun.build({ entrypoints: [entry], target: "bun", external: ["bun:test"], plugins: [{
        name: "realization-memo-source-fault", setup(builder) {
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
      expect(passed + failed).toBe(5);
      expect(log).not.toMatch(/\n\s+[1-9]\d* (skip|todo)\n/u);
      if (variant === "baseline") { expect(exit).toBe(0); expect(failed).toBe(0); }
      else { expect(exit).not.toBe(0); expect(failures.some(line => line.includes(assertion))).toBe(true); }
    }
    expect(reports[0]?.sourceSha256).not.toBe(reports[1]?.sourceSha256);
  }, 120_000);
}
