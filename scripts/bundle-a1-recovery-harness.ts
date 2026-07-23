import { resolve } from "node:path";

/**
 * Bundles the A1 recovery browser harness into one self-contained IIFE for
 * the Playwright reload spec. Invoked as `bun
 * scripts/bundle-a1-recovery-harness.ts <output-path>`.
 */

const ROOT = resolve(import.meta.dirname, "..");
const ENTRY = resolve(
  ROOT,
  "src/test-support/a1-recovery-browser-harness.ts",
);

const outputPath = Bun.argv[2];
if (outputPath === undefined || outputPath.length === 0) {
  throw new Error("Usage: bun scripts/bundle-a1-recovery-harness.ts <out>");
}

const result = await Bun.build({
  entrypoints: [ENTRY],
  target: "browser",
  format: "iife",
  packages: "bundle",
  splitting: false,
  minify: false,
  sourcemap: "none",
});
if (!result.success) {
  throw new Error(
    `A1_RECOVERY_BUNDLE_FAILED: ${result.logs.map((log) => log.message).join("\n")}`,
  );
}
const output = result.outputs[0];
if (result.outputs.length !== 1 || output === undefined) {
  throw new Error("A1_RECOVERY_BUNDLE_SHAPE");
}
await Bun.write(outputPath, output);
console.log(outputPath);
