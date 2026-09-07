/** U5's independently specified counterfactuals, applied to actual production
 * source in isolated bundles. Native focus restoration (U5-MUT-013) remains a
 * browser control; no mocked DOM or returned fixture result replaces it here.
 */
import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "../..");
const output = await mkdtemp(join(tmpdir(), "jcpe-u5-production-faults-"));

const faults = [
  [
    "U5-MUT-001",
    "src/application/studio-local-replacement.ts",
    "tests/integration/studio-local-replacement.test.ts",
    "    let raw: unknown;",
    "    workflow.localPublication.publish(prepared.preparation, {\n      requestId: request.identity.requestId, retiredTransportGeneration: request.expectedTransportGeneration,\n      progressionRetired: true, previewRetired: true, noFutureAttack: true,\n    });\n    let raw: unknown;",
    "a pending retirement locks history"
  ],
  [
    "U5-MUT-002",
    "src/application/studio-local-replacement.ts",
    "tests/integration/studio-local-replacement.test.ts",
    "  function cancel(): void {",
    "  function cancel(): void { composition.controller.setTitle(\"Changed by Cancel\");",
    "Cancel and export-first preserve state"
  ],
  [
    "U5-MUT-003",
    "src/application/studio-local-replacement.ts",
    "tests/integration/studio-local-replacement.test.ts",
    "if (!facts.confirmationRequired && !assessed.oversized) await confirm(false);",
    "if (!assessed.oversized) await confirm(false);",
    "lesson stays inert until confirmation"
  ],
  [
    "U5-MUT-004",
    "src/application/studio-recovery-session.ts",
    "tests/integration/studio-recovery-orchestrator.test.ts",
    "statusText = RECOVERY_STATUS_VOCABULARY.changesPending;",
    "statusText = \"Save complete\";",
    "U5 quota failure keeps recovery pending"
  ],
  [
    "U5-MUT-005-previous",
    "src/application/studio-recovery-session.ts",
    "tests/integration/studio-recovery-orchestrator.test.ts",
    "publish({ offer: Object.freeze({",
    "publish({ offer: view.disposition === \"offer-previous\" ? null : Object.freeze({",
    "a previous offer stays explicit"
  ],
  [
    "U5-MUT-005-unrecoverable",
    "src/application/studio-recovery-session.ts",
    "tests/integration/studio-recovery-orchestrator.test.ts",
    "publish({ failureMessage: `Neither local recovery copy could be opened (${code}). Your current chart is unchanged. Export JSON to keep a portable copy.` });",
    "publish({ failureMessage: null });",
    "U5 renders corrupt/unavailable status"
  ],
  [
    "U5-MUT-006",
    "src/application/studio-document-import.ts",
    "tests/integration/studio-document-import.test.ts",
    "exportRecommended: confirmationFacts().exportRecommended || preview.replacementImpact.undoDisposition === \"explicitly-unavailable\" });",
    "exportRecommended: confirmationFacts().exportRecommended || preview.replacementImpact.undoDisposition === \"explicitly-unavailable\" }); await commit(false); await commit(false);",
    "independent nested JSON stays a preview until confirmation"
  ],
  [
    "U5-MUT-007",
    "src/application/e0-interchange.ts",
    "tests/integration/studio-document-import.test.ts",
    "legacyCand.report.groups.rejected,",
    "[],",
    "retained legacy refusals carry their exact codes"
  ],
  [
    "U5-MUT-008",
    "src/application/studio-lifecycle.ts",
    "tests/integration/studio-lifecycle-export.test.ts",
    "if (view.dialog === null || view.phase === \"delivering\") return;",
    "if (view.dialog === null || view.phase === \"delivering\") return;\n      const current = composition.readApplicationState();\n      composition.interchangeOwner.publishCanonicalExportRevision({ publication: {\n        schema: \"changes.canonical-export-revision-publication.v1\", documentId: current.document.id, revision: current.revision,\n      } });",
    "Cancel abandons the private preparation"
  ],
  [
    "U5-MUT-009",
    "src/application/studio-controller.ts",
    "tests/integration/studio-midi-export-marker.test.ts",
    "startDelivery: options.midiExportDelivery,",
    "startDelivery: (request) => { state = { ...state, exportRevision: state.revision }; return options.midiExportDelivery!(request); },",
    "U5-LIFE-018"
  ],
  [
    "U5-MUT-010",
    "src/application/studio-recovery-session.ts",
    "tests/integration/studio-recovery-orchestrator.test.ts",
    "publish({ statusText, diagnosticCode: status.lastRefusal,",
    "if (status.lastRefusal !== null) composition.replacementWorkflow.applyLifecycleIntent({ kind: \"push-dialog\", dialog: {\n      id: \"incorrect-storage-lock\", kind: \"lifecycle-export\", phase: \"committing\", blocksHistory: true, requestId: null,\n    } });\n    publish({ statusText, diagnosticCode: status.lastRefusal,",
    "U5 (quota|denied) failure keeps recovery pending"
  ],
  [
    "U5-MUT-011",
    "src/application/application-selectors.ts",
    "tests/integration/studio-lifecycle-export.test.ts",
    "canUndo: !locked && undo !== undefined,",
    "canUndo: undo !== undefined,",
    "delivery is single-use and history-blocking"
  ],
  [
    "U5-MUT-012",
    "src/application/studio-local-replacement.ts",
    "tests/integration/studio-local-replacement.test.ts",
    "const pushed = workflow.applyLifecycleIntent({ kind: \"push-dialog\", dialog: {\n      id: DIALOG_ID, kind: assessed.oversized ? \"history-limit\" : origin === \"new\" ? \"new-document\" : \"lesson-load\",\n      phase: \"open\", blocksHistory: false, requestId: identity.requestId } });",
    "const pushed = { ok: true };",
    "new stays inert until confirmation"
  ],
  [
    "U5-MUT-014",
    "src/application/studio-recovery-session.ts",
    "tests/integration/studio-recovery-orchestrator.test.ts",
    "!options.sessionEdited && !draftInput && composition.readApplicationState() === initial",
    "!options.sessionEdited",
    "U5 automatic recovery downgrades"
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
        name: "u5-owned-source-fault", setup(builder) {
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
