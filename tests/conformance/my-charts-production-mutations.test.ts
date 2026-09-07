/** Independent collection assertions must reject actual production
 * source faults. Isolated bundles never enter the shipped artifact. */
import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "../..");
const output = await mkdtemp(join(tmpdir(), "jcpe-my-charts-production-faults-"));

const faults = [
  [
    "COLLECTION-COUNT",
    "src/persistence/my-charts-contract.ts",
    "tests/unit/my-charts.test.ts",
    "records: 128",
    "records: 129",
    "byte and count caps"
  ],
  [
    "BACKUP-UNKNOWN-FIELD",
    "src/application/my-charts.ts",
    "tests/unit/my-charts.test.ts",
    "Object.keys(raw).length !== 2",
    "false",
    "backup refuses unknown outer field"
  ],
  [
    "BACKUP-EXACT-NEGATIVE-ZERO",
    "src/application/my-charts.ts",
    "tests/unit/my-charts.test.ts",
    "documentText: serializeCanonicalDocument(document)",
    "documentText: JSON.stringify(document)",
    "lexical negative zero"
  ],
  [
    "BACKUP-ANNOTATION-PRESERVATION",
    "src/application/my-charts.ts",
    "tests/unit/my-charts.test.ts",
    "documentText: serializeCanonicalDocument(document)",
    "documentText: serializeCanonicalDocument({ ...document, description: \"\" })",
    "canonical backup restores every independent field"
  ],
  [
    "DUPLICATE-IDENTITY",
    "src/application/my-charts.ts",
    "tests/unit/my-charts.test.ts",
    "decodeDocumentShape(copied.value)",
    "decodeDocumentShape(row.document)",
    "F1 duplicate remaps every musical identity"
  ],
  [
    "RENAME-REAL-DOCUMENT",
    "src/application/my-charts.ts",
    "tests/unit/my-charts.test.ts",
    "keepChartDocument(changed.state.document, row.recordId, updatedAt)",
    "keepChartDocument(row.document, row.recordId, updatedAt)",
    "rename changes exactly the kept document title"
  ],
  [
    "RESTORE-EXPLICIT-DECISION",
    "src/application/my-charts.ts",
    "tests/unit/my-charts.test.ts",
    "if (!choices.has(id))",
    "if (false)",
    "restore independently classifies same-record-different-bytes"
  ],
  [
    "RECORD-NOT-MUSICAL-IDENTITY",
    "src/application/my-charts.ts",
    "tests/unit/my-charts.test.ts",
    "const current = existing.get(row.recordId);",
    "const current = local.find(item => item.document.id === row.document.id);",
    "restore independently classifies duplicate-title-and-musical-id"
  ],
  [
    "COLLECTION-OWNER-RETIREMENT",
    "src/application/studio-my-charts.ts",
    "tests/integration/my-charts-integration.test.ts",
    "const result = await options.storage.compareAndSwap(expected, next, pending.signal);\n      if (operation !== pending || !hosted()) return;",
    "const result = await options.storage.compareAndSwap(expected, next, pending.signal);",
    "retired read and write completions"
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
        name: "my-charts-owned-source-fault", setup(builder) {
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
