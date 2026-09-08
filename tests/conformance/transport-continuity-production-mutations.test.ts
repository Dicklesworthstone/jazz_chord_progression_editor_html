/** Independent transport-continuity assertions must reject actual production
 * source faults. Isolated bundles never enter the shipped artifact. */
import { expect, test, setDefaultTimeout } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

setDefaultTimeout(60_000);

const root = resolve(import.meta.dirname, "../..");
const output = await mkdtemp(join(tmpdir(), "jcpe-transport-continuity-faults-"));

const faults = [
  ["SOURCE-REQUEST", "src/application/application-state.ts", "tests/unit/transport-current-source.test.ts",
    "currentSource.commandRequestId !== notification.commandRequestId ||", "false ||", "current-source near miss"],
  ["SOURCE-REVISION", "src/application/application-state.ts", "tests/unit/transport-current-source.test.ts",
    "currentSource.planRevision !== notification.planRevision ||", "false ||", "current-source near miss"],
  ["VIEW-REVISION", "src/application/application-state.ts", "tests/unit/transport-current-source.test.ts",
    "currentSource.viewRevision !== state.revision ||", "false ||", "current-source near miss"],
  ["SOURCE-GENERATION", "src/application/application-state.ts", "tests/unit/transport-current-source.test.ts",
    "currentSource.generation !== notification.generation ||", "false ||", "current-source near miss"],
  ["SOURCE-SEQUENCE", "src/application/application-state.ts", "tests/unit/transport-current-source.test.ts",
    "currentSource.notificationSequence !== notification.notificationSequence ||", "false ||", "current-source near miss"],
  ["SOURCE-STATUS", "src/application/application-state.ts", "tests/unit/transport-current-source.test.ts",
    "currentSource.status !== notification.status ||", "false ||", "current-source near miss"],
  ["PENDING-EXPECTATION", "src/application/application-state.ts", "tests/unit/transport-current-source.test.ts",
    "notification.commandRequestId < state.transport.commandRequestId", "false", "a live source cannot overtake"],
  ["FOREIGN-DOCUMENT", "src/application/application-state.ts", "tests/unit/transport-current-source.test.ts",
    "notification.documentId !== state.document.id || identityStale ||", "identityStale ||", "foreign document identity"],
  ["PREDECESSOR-AUTHORITY", "src/application/studio-controller.ts", "tests/unit/studio-transport-notification-continuity.test.ts",
    "run.viewRevision === previousRevision && state.revision === previousRevision + 1", "state.revision === previousRevision + 1", "a prior tempo edit cannot gain"],
  ["LIVE-SOURCE-WIRING", "src/application/studio-controller.ts", "tests/unit/studio-transport-notification-continuity.test.ts",
    "...(currentSource === undefined ? {} : { currentSource }),", "...{},", "actual interruption reaches the studio after metronome"],
  ["INSTRUMENT-AUTHORIZATION", "src/application/studio-controller.ts", "tests/unit/studio-transport-notification-continuity.test.ts",
    "carryLiveProjectionAcrossMixEdit(previousRevision);\n      const run = activeRun;", "const run = activeRun;", "actual interruption reaches the studio after instrument"],
  ["VOLUME-AUTHORIZATION", "src/application/studio-controller.ts", "tests/unit/studio-transport-notification-continuity.test.ts",
    "carryLiveProjectionAcrossMixEdit(previousRevision);\n      if (!sessionMuted)", "if (!sessionMuted)", "actual interruption reaches the studio after volume"],
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
        name: "transport-continuity-owned-source-fault", setup(builder) {
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
