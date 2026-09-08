import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "../..");
const entry = resolve(root, "tests/support/loop-arrangement-mutation-entry.ts");
const output = await mkdtemp(join(tmpdir(), "jcpe-loop-arrangement-faults-"));
const faults = [
  ["LITERAL-FALLBACK", "src/application/studio-playback.ts", "const performance = performStudioPlaybackPlan(fullPlan, styleId);", "const performance = fullPlan;", "ordinary loop Play keeps separate bass and comp"],
  ["REBASED-TIME", "src/playback/project-playback-loop.ts", "numerator: clippedStart, denominator:", "numerator: clippedStart - start, denominator:", "independent pre-production interval fixtures"],
  ["LOST-OFFSET", "src/playback/project-playback-loop.ts", "(event.sourceOffsetTicks ?? 0) + clippedStart", "0 + clippedStart", "independent pre-production interval fixtures"],
  ["LOST-REST-PHASE", "src/application/studio-playback.ts", "? [measureCapacity(document.meter)] :", "? [] :", "section boundaries retain pickup"],
  ["STALE-LIVE-GROOVE", "src/application/studio-controller.ts", "return performStudioPlaybackRange(base.plan, range, styleId);", "return performStudioPlaybackRange(base.plan, range, \"ballad-comp@1\");", "live loop, section, groove and instrument paths"],
  ["RECIPE-VOICE-COLLISION", "src/audio/transport.ts", "voiceId: `x1:g${String(generation)}:e${String(eventIndex)}:i${instrumentId}:v${String(index)}`", "voiceId: `x1:g${String(generation)}:e${String(eventIndex)}:v${String(index)}`", "a pending loop bass attack survives an instrument change to vibraphone"],
  ["MISSING-SECTION-FALLBACK", "src/application/studio-controller.ts", "if (loopSectionId !== null && range === null) {", "if (false) {", "a removed armed section refuses Play until Undo restores the exact section"],
] as const;

for (const [id, relativeSource, needle, replacement, assertion] of faults) {
  test(`${id}: actual production fault fails the unchanged musical assertion`, async () => {
    const owner = resolve(root, relativeSource), original = await readFile(owner, "utf8");
    expect(original.split(needle)).toHaveLength(2);
    const reports = [];
    for (const variant of ["baseline", "mutant"] as const) {
      const contents = variant === "baseline" ? original : original.replace(needle, replacement);
      const built = await Bun.build({ entrypoints: [entry], target: "bun", external: ["bun:test"], plugins: [{
        name: "loop-arrangement-source-fault", setup(builder) {
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
      expect(passed + failed).toBe(22);
      expect(log).not.toMatch(/\n\s+[1-9]\d* (skip|todo)\n/u);
      if (variant === "baseline") { expect(exit).toBe(0); expect(failed).toBe(0); }
      else { expect(exit).not.toBe(0); expect(failures.some(line => line.includes(assertion))).toBe(true); }
    }
    expect(reports[0]?.sourceSha256).not.toBe(reports[1]?.sourceSha256);
  }, 120_000);
}
