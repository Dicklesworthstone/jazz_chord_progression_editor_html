import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const destination = resolve(root, "ios/TheoryBridge/frankenjazz-theory-bridge.js");
const result = await Bun.build({
  entrypoints: [resolve(root, "ios/TheoryBridgeSource/entry.ts")],
  target: "browser",
  format: "iife",
  minify: {
    whitespace: true,
    syntax: true,
    identifiers: true,
  },
  sourcemap: "none",
});

if (!result.success || result.outputs.length !== 1 || !result.outputs[0]) {
  for (const log of result.logs) console.error(log);
  throw new Error("Failed to build the FrankenJazz native theory bridge");
}

const bundle = (await result.outputs[0].text()).trimEnd();
const generated = `// @generated from ios/TheoryBridgeSource/entry.ts; do not hand-edit.\n${bundle}\n`;
if (process.argv.includes("--check")) {
  const current = await readFile(destination, "utf8").catch(() => "");
  if (current !== generated) {
    throw new Error("Native theory bridge is stale; run bun run build:ios-theory-bridge");
  }
  console.log(`Native theory bridge is current (${String(generated.length)} UTF-8 characters)`);
} else {
  await Bun.write(destination, generated);
  console.log(`Wrote ${destination} (${String(generated.length)} UTF-8 characters)`);
}
