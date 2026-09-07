/** Exact-sharing preservation and refusal laws, checked against actual source
 * faults. These isolated bundles never alter the shipped artifact. */
import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "../..");
const output = await mkdtemp(join(tmpdir(), "jcpe-exact-share-production-faults-"));

const faults = [
  [
    "SHARE-ANNOTATION",
    "src/export/interchange-json.ts",
    "tests/unit/exact-share.test.ts",
    "    annotation: event.annotation,",
    "    annotation: \"\",",
    "entire independent document"
  ],
  [
    "SHARE-ORDER",
    "src/export/interchange-json.ts",
    "tests/unit/exact-share.test.ts",
    "      pitches: voicing.pitches.map(projectPitch),",
    "      pitches: [...voicing.pitches].reverse().map(projectPitch),",
    "entire independent document"
  ],
  [
    "SHARE-UNISON",
    "src/export/interchange-json.ts",
    "tests/unit/exact-share.test.ts",
    "      pitches: voicing.pitches.map(projectPitch),",
    "      pitches: voicing.pitches.filter((pitch,index,pitches) => pitches.findIndex(other => other.step===pitch.step && other.alter===pitch.alter && other.octave===pitch.octave)===index).map(projectPitch),",
    "entire independent document"
  ],
  [
    "SHARE-PROVENANCE",
    "src/export/interchange-json.ts",
    "tests/unit/exact-share.test.ts",
    "      engineVersion: voicing.generatedBy.engineVersion,",
    "      engineVersion: \"discarded-provenance\",",
    "entire independent document"
  ],
  [
    "SHARE-LIMIT",
    "src/application/exact-share.ts",
    "tests/unit/exact-share.test.ts",
    "MAX_EXACT_SHARE_BYTES = 6_138",
    "MAX_EXACT_SHARE_BYTES = 6_140",
    "exact byte boundary"
  ],
  [
    "SHARE-DUPLICATE",
    "src/application/exact-share-startup.ts",
    "tests/integration/exact-share-integration.test.ts",
    "await documentImport.previewPaste(text, \"canonical-json\");",
    "await documentImport.previewPaste(JSON.stringify(JSON.parse(text)), \"canonical-json\");",
    "startup refuses escaped duplicate"
  ],
  [
    "SHARE-STALE-COPY",
    "src/application/studio-exact-share.ts",
    "tests/integration/exact-share-integration.test.ts",
    "if (!current()) { prepare(",
    "if (false) { prepare(",
    "a changed chart needs a second"
  ],
  [
    "SHARE-LATE-COPY",
    "src/application/studio-exact-share.ts",
    "tests/integration/exact-share-integration.test.ts",
    "if (bound !== selectedBound || !current()) {",
    "if (false) {",
    "late clipboard cannot certify.*false"
  ],
  [
    "SHARE-LOSSY-FALLBACK",
    "src/application/exact-share.ts",
    "tests/integration/exact-share-integration.test.ts",
    "  if (bytes.length > MAX_EXACT_SHARE_BYTES) return limitRefusal();",
    "  if (bytes.length > MAX_EXACT_SHARE_BYTES) return {ok:true,value:\"#zdoc=1.e30\"};",
    "oversized sharing opens existing"
  ],
  [
    "SHARE-NEGATIVE-ZERO",
    "src/application/exact-share.ts",
    "tests/unit/exact-share.test.ts",
    "const source = serializeCanonicalDocument(document);",
    "const source = serializeCanonicalDocument(document).replaceAll(\": -0\", \": 0\");",
    "lexical compaction preserves"
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
        name: "exact-share-owned-source-fault", setup(builder) {
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
