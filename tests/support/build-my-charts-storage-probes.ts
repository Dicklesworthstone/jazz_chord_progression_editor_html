import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const destination = process.argv[2]; if (destination === undefined) throw new Error("Probe destination required");
await mkdir(destination, { recursive: true });
const owner = resolve("src/persistence/browser-my-charts.ts"), original = await readFile(owner, "utf8");
const faults = [
  { id: "baseline", needle: "", replacement: "" },
  { id: "cas-removed", needle: "if ((current.result === undefined ? null : current.result) !== expected.token)", replacement: "if (false)" },
  { id: "early-receipt", needle: "value => { outcome = { ok: true, value }; }", replacement: "value => { outcome = { ok: true, value }; finish(outcome); }" },
  { id: "outside-transaction-delete", needle: "documents.delete(row.payloadKey)", replacement: 'tx.db.transaction("documents", "readwrite").objectStore("documents").delete(row.payloadKey)' },
  { id: "empty-generation-reset", needle: "const generation = expected.generation + 1", replacement: "const generation = records.length === 0 ? 0 : expected.generation + 1" },
  { id: "generation-wrap", needle: "if (expected.generation === Number.MAX_SAFE_INTEGER)", replacement: "if (false)" },
];
const reports = [];
for (const fault of faults) {
  if (fault.id !== "baseline" && original.split(fault.needle).length !== 2) throw new Error(`Non-unique source fault ${fault.id}`);
  const contents = fault.id === "baseline" ? original : original.replace(fault.needle, fault.replacement);
  const built = await Bun.build({ entrypoints: [resolve("tests/e2e/my-charts-storage-probe.ts")], target: "browser", minify: true,
    plugins: [{ name: "independent-native-storage-source-fault", setup(builder) {
      builder.onLoad({ filter: /browser-my-charts\.ts$/u }, args => args.path === owner ? { contents, loader: "ts", resolveDir: dirname(owner) } : undefined);
    } }],
  });
  if (!built.success || built.outputs[0] === undefined) throw new Error(`Probe build failed: ${fault.id}`);
  const script = await built.outputs[0].text(), cspHash = createHash("sha256").update(script).digest("base64");
  // The same inert embedded favicon as the studio prevents Firefox from
  // inventing a network /favicon.ico request for this private harness.
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${cspHash}'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E"><title>Native My Charts storage proof</title></head><body><script>${script}</script></body></html>`;
  await writeFile(resolve(destination, `${fault.id}.html`), html);
  reports.push({ variant: fault.id, source: "src/persistence/browser-my-charts.ts", sourceSha256: createHash("sha256").update(contents).digest("hex"),
    artifactSha256: createHash("sha256").update(html).digest("hex") });
}
await writeFile(resolve(destination, "source-report.json"), JSON.stringify(reports, null, 2) + "\n");
