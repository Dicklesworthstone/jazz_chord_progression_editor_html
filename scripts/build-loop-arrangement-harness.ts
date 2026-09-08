import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Retain the real standalone CSS, fonts and restrictive CSP, replacing only
// its composition root with the observational native-audio test composition.
const hash = (text: string): string => createHash("sha256").update(text).digest("base64");
const build = await Bun.build({ entrypoints: ["tests/e2e/loop-arrangement-harness.tsx"], target: "browser", minify: true });
if (!build.success || build.outputs.length !== 1) throw new Error(`Loop harness build failed: ${build.logs.map(log => log.message).join("; ")}`);
const output = build.outputs[0]; if (!output) throw new Error("Missing harness bundle");
const code = await output.text();
const artifact = await readFile("jazz_chord_progression_editor.html", "utf8");
const scripts = [...artifact.matchAll(/<script type="module">([\s\S]*?)<\/script>/gu)];
const script = scripts[0];
if (scripts.length !== 1 || !script?.[1]) throw new Error("Expected one standalone module");
const oldHash = `sha256-${hash(script[1])}`;
if (!artifact.includes(oldHash)) throw new Error("Standalone module CSP hash mismatch");
const html = artifact.replace(script[0], () => `<script type="module">${code}</script>`).replace(oldHash, `sha256-${hash(code)}`);
await mkdir("test-results/loop-arrangement", { recursive: true });
await writeFile("test-results/loop-arrangement/index.html", html);
console.log(JSON.stringify({ path: "test-results/loop-arrangement/index.html", bytes: Buffer.byteLength(html), sha256: createHash("sha256").update(html).digest("hex") }));
