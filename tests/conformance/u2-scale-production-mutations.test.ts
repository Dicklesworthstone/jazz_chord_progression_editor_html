/** Independent scale/projection assertions must reject actual production
 * source faults. Isolated bundles never enter the shipped artifact. */
import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "../..");
const output = await mkdtemp(join(tmpdir(), "jcpe-u2-scale-production-faults-"));

const faults = [
  [
    "SCALE-CONTAINMENT",
    "src/theory/chart-scale-containment.ts",
    "tests/unit/chart-scale-containment.test.ts",
    "realization.degrees.some(degree => !contains(degree.number, degree.alter))",
    "false",
    "Cmaj7b9, unkeyed"
  ],
  [
    "SCALE-DEGREE-IDENTITY",
    "src/theory/chart-scale-containment.ts",
    "tests/unit/chart-scale-containment.test.ts",
    "degree === (number - 1) % 7 + 1 && alter === alteration",
    "((number === 11 && alteration === 1 && degree === 5 && alter === -1) || (degree === (number - 1) % 7 + 1 && alter === alteration))",
    "C7b9b5#11, unkeyed"
  ],
  [
    "SCALE-NATURAL-FIFTH",
    "src/theory/chart-analysis.ts",
    "tests/unit/chart-scale-containment.test.ts",
    "return \"half–whole diminished\";",
    "return \"altered\";",
    "C7b9, unkeyed"
  ],
  [
    "SCALE-SLASH-BASS",
    "src/theory/chart-scale-containment.ts",
    "tests/unit/chart-scale-containment.test.ts",
    "if (!contains(degreeIndex + 1, alteration)) return null;",
    "if (false) return null;",
    "off-formula slash bass"
  ],
  [
    "INSPECTOR-HARMONY",
    "src/application/chord-inspector.ts",
    "tests/integration/u2-inspector-packet.test.ts",
    "scaleSuggestions: Object.freeze(analysis?.scaleSentence ? [analysis.scaleSentence] : []),",
    "scaleSuggestions: Object.freeze([\"Invented scale\"]),",
    "U2-INSP-003"
  ],
  [
    "INSPECTOR-FROZEN",
    "src/application/chord-inspector.ts",
    "tests/integration/u2-inspector-packet.test.ts",
    "canSwitchToFrozen: voicingMode === \"auto\" && activePitches.length > 0,",
    "canSwitchToFrozen: activePitches.length > 0,",
    "U2-INSP-004"
  ]
] as const;

for (const [fault, relativeSource, relativeTest, needle, replacement, pattern] of faults) {
  test(`${fault}: unchanged assertions reject the production-source defect`, async () => {
    const owner = resolve(root, relativeSource), entry = resolve(root, relativeTest);
    const original = await readFile(owner, "utf8");
    expect(original.split(needle)).toHaveLength(2);
    const diagnostics = [];
    for (const variant of ["baseline", "mutant"] as const) {
      const contents = variant === "baseline" ? original : original.replace(needle, replacement);
      const built = await Bun.build({ entrypoints: [entry], target: "bun", external: ["bun:test"], plugins: [{
        name: "u2-scale-owned-source-fault", setup(builder) {
          builder.onLoad({ filter: /\.(ts|tsx)$/ }, async args => {
            if (args.path === owner) return { contents, loader: "ts", resolveDir: dirname(owner) };
            if (args.path === entry) return {
              contents: (await readFile(entry, "utf8")).replaceAll("import.meta.url", JSON.stringify(pathToFileURL(entry).href)),
              loader: "ts", resolveDir: dirname(entry),
            };
            return undefined;
          });
        },
      }] });
      expect(built.success).toBe(true);
      const artifact = built.outputs[0];
      if (artifact === undefined) throw new Error(`No test bundle for ${fault}`);
      const file = join(output, `${fault}-${variant}.test.js`);
      await writeFile(file, await artifact.text());
      const command = [process.execPath, "test", file, "--test-name-pattern", pattern];
      const child = Bun.spawn(command, { cwd: root, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, exit] = await Promise.all([
        new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
      ]);
      const log = stdout + stderr;
      const passed = Number(/\n\s+(\d+) pass\n/.exec(log)?.[1] ?? 0);
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
