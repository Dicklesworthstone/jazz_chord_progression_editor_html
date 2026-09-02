/**
 * Development-time generator for the embedded Concert Grand DSP module.
 *
 * `bun run build` never runs cargo: the wasm payload is checked-in source at
 * `src/audio/wasm/concert-grand-wasm.ts`, generated here from
 * `dsp/concert-grand`. Reproducing the payload requires the pinned Rust
 * toolchain recorded in the generated banner; `--check` rebuilds and fails on
 * any drift between the Rust source and the checked-in payload so the two
 * cannot silently diverge.
 *
 * Usage:
 *   bun scripts/build-dsp.ts            # regenerate the embedded module
 *   bun scripts/build-dsp.ts --check    # rebuild and verify zero drift (cargo)
 *   bun scripts/build-dsp.ts --sources  # compare the dsp/ source tree against
 *                                       # the closure ledger recorded in the
 *                                       # checked-in module (bun-only, no cargo)
 *
 * The generated module additionally records a SOURCE-CLOSURE LEDGER: the
 * sha256 of every Rust source, Cargo manifest/lock, and toolchain pin that
 * fed the payload, plus one closure hash over the sorted ledger. `--sources`
 * compares the live tree against that ledger without any Rust toolchain, so
 * "the crate no longer describes the shipping payload" is detectable on any
 * machine (bead jcpe-deploy-pipeline-restoration-kbvj.2; the observed defect
 * was vibes_v2.rs changing the day after a payload pin with nothing watching).
 * Exit codes for --sources: 0 match, 1 drift, 2 ledger-absent (a pre-ledger
 * pin) — distinct so a future gate wiring can choose its own strictness.
 */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const crateDir = resolve(root, "dsp/concert-grand");
const modulePath = resolve(root, "src/audio/wasm/concert-grand-wasm.ts");
const wasmPath = resolve(
  process.env["CARGO_TARGET_DIR"] ?? resolve(crateDir, "target"),
  "wasm32-unknown-unknown/release/concert_grand.wasm",
);


/** Files whose bytes determine the compiled payload, relative to the repo. */
async function closureFiles(): Promise<readonly string[]> {
  const files: string[] = [
    "dsp/concert-grand/Cargo.toml",
    "dsp/concert-grand/Cargo.lock",
    "dsp/concert-grand/rust-toolchain.toml",
  ];
  const srcDir = resolve(crateDir, "src");
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await walk(resolve(dir, entry.name), path);
      else if (entry.name.endsWith(".rs")) files.push(path);
    }
  };
  await walk(srcDir, "dsp/concert-grand/src");
  return Object.freeze([...files].sort());
}

export type DspSourceClosure = Readonly<{
  closureSha256: string;
  files: ReadonlyMap<string, string>;
}>;

/** Deterministic ledger: sha256 per closure file + one hash over the ledger. */
export async function computeDspSourceClosure(): Promise<DspSourceClosure> {
  const files = new Map<string, string>();
  for (const relPath of await closureFiles()) {
    const bytes = await readFile(resolve(root, relPath));
    files.set(relPath, createHash("sha256").update(bytes).digest("hex"));
  }
  const ledger = [...files.entries()]
    .map(([path, hash]) => `${hash}  ${path}`)
    .join("\n");
  return Object.freeze({
    closureSha256: createHash("sha256").update(ledger, "utf8").digest("hex"),
    files,
  });
}

export type DspSourceComparison =
  | Readonly<{ outcome: "match"; closureSha256: string }>
  | Readonly<{ outcome: "ledger-absent" }>
  | Readonly<{
      outcome: "drift";
      recordedClosureSha256: string;
      liveClosureSha256: string;
      changed: readonly string[];
      added: readonly string[];
      removed: readonly string[];
    }>;

/** Compare a live closure against the ledger inside generated module text. */
export function compareDspSourceClosure(
  moduleText: string,
  live: DspSourceClosure,
): DspSourceComparison {
  const recordedHash =
    /CONCERT_GRAND_DSP_SOURCE_CLOSURE_SHA256 =\n {2}"([0-9a-f]{64})"/u.exec(
      moduleText,
    )?.[1];
  const ledgerMatch = /CONCERT_GRAND_DSP_SOURCE_CLOSURE = Object\.freeze\(\n(\{[\s\S]*?\}) as const,\n\)/u.exec(
    moduleText,
  )?.[1];
  if (recordedHash === undefined || ledgerMatch === undefined) {
    return Object.freeze({ outcome: "ledger-absent" });
  }
  const recorded = new Map<string, string>(
    Object.entries(JSON.parse(ledgerMatch) as Record<string, string>),
  );
  if (recordedHash === live.closureSha256) {
    return Object.freeze({ outcome: "match", closureSha256: recordedHash });
  }
  const changed: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  for (const [path, hash] of live.files) {
    const prior = recorded.get(path);
    if (prior === undefined) added.push(path);
    else if (prior !== hash) changed.push(path);
  }
  for (const path of recorded.keys()) {
    if (!live.files.has(path)) removed.push(path);
  }
  return Object.freeze({
    outcome: "drift",
    recordedClosureSha256: recordedHash,
    liveClosureSha256: live.closureSha256,
    changed: Object.freeze(changed),
    added: Object.freeze(added),
    removed: Object.freeze(removed),
  });
}

async function runSourcesMode(): Promise<never> {
  const moduleText = await readFile(modulePath, "utf8").catch(() => null);
  if (moduleText === null) throw new Error(`DSP_MODULE_MISSING: ${modulePath}`);
  const comparison = compareDspSourceClosure(
    moduleText,
    await computeDspSourceClosure(),
  );
  if (comparison.outcome === "ledger-absent") {
    process.stdout.write(
      "dsp-sources ledger-absent: the checked-in payload predates the " +
        "source-closure ledger; the next re-pin records it\n",
    );
    process.exit(2);
  }
  if (comparison.outcome === "match") {
    process.stdout.write(
      `dsp-sources ok closure=${comparison.closureSha256}\n`,
    );
    process.exit(0);
  }
  process.stdout.write(
    `dsp-sources DRIFT recorded=${comparison.recordedClosureSha256} ` +
      `live=${comparison.liveClosureSha256}\n` +
      [
        ...comparison.changed.map((path) => `  changed ${path}`),
        ...comparison.added.map((path) => `  added ${path}`),
        ...comparison.removed.map((path) => `  removed ${path}`),
      ].join("\n") +
      "\n",
  );
  process.exit(1);
}

async function run(): Promise<void> {
  if (process.argv.includes("--sources")) await runSourcesMode();
  const checkOnly = process.argv.includes("--check");

  const build = Bun.spawn(
    [
      "cargo",
      "build",
      "--release",
      "--locked",
      "--target",
      "wasm32-unknown-unknown",
    ],
    {
      cwd: crateDir,
      env: {
        ...process.env,
        RCH_CARGO_WRAPPER_BYPASS: "1",
        RUSTFLAGS: "-C link-arg=--export=__heap_base",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const exitCode = await build.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(build.stderr).text();
    throw new Error(`DSP_CARGO_BUILD_FAILED\n${stderr}`);
  }

  const rustcVersion = (
    await new Response(
      Bun.spawn(["rustc", "--version"], { stdout: "pipe" }).stdout,
    ).text()
  ).trim();

  const wasmOptCommand = process.env["WASM_OPT"] ?? "wasm-opt";
  const wasmOptVersion = (
    await new Response(
      Bun.spawn([wasmOptCommand, "--version"], { stdout: "pipe" }).stdout,
    ).text()
  ).trim();
  if (wasmOptVersion !== "wasm-opt version 131 (version_131)") {
    throw new Error(`DSP_WASM_OPT_VERSION:${wasmOptVersion || "unavailable"}`);
  }
  const optimizeRoot = await mkdtemp(join(tmpdir(), "jcpe-wasm-opt-"));
  const optimizedPath = join(optimizeRoot, "concert_grand.wasm");
  let wasm: Uint8Array;
  try {
    const optimize = Bun.spawn([
      wasmOptCommand,
      "-Oz",
      "--enable-bulk-memory",
      "--enable-bulk-memory-opt",
      "--enable-nontrapping-float-to-int",
      "--enable-sign-ext",
      wasmPath,
      "-o",
      optimizedPath,
    ], { stdout: "pipe", stderr: "pipe" });
    if (await optimize.exited !== 0) {
      const stderr = await new Response(optimize.stderr).text();
      throw new Error(`DSP_WASM_OPT_FAILED\n${stderr}`);
    }
    wasm = new Uint8Array(await readFile(optimizedPath));
  } finally {
    await rm(optimizeRoot, { recursive: true, force: true });
  }
  const sha256 = createHash("sha256").update(wasm).digest("hex");
  const base64 = Buffer.from(wasm).toString("base64");
  const closure = await computeDspSourceClosure();

  const generated = `/**
 * @generated by scripts/build-dsp.ts — do not hand-edit.
 *
 * Source: dsp/concert-grand (Rust), compiled for wasm32-unknown-unknown with
 * opt-level=2, fat LTO, panic=abort, --export=__heap_base, then Binaryen
 * wasm-opt 131 -Oz with the module's reviewed WebAssembly features enabled.
 * Toolchain: ${rustcVersion}
 *
 * The payload is project-owned code under the repository license plus the
 * MIT/Apache-2.0 \`libm\` software-float library; both are recorded in the
 * build's license inventory. Regenerate with \`bun scripts/build-dsp.ts\`;
 * verify drift with \`--check\`.
 */

export const CONCERT_GRAND_WASM_SHA256 =
  "${sha256}";

export const CONCERT_GRAND_WASM_BYTE_LENGTH = ${String(wasm.byteLength)};

export const CONCERT_GRAND_WASM_BASE64 =
  "${base64}";

/**
 * Source-closure ledger: sha256 of every file that fed this payload, and one
 * hash over the sorted ledger. \`bun scripts/build-dsp.ts --sources\` compares
 * the live tree against it without cargo.
 */
export const CONCERT_GRAND_DSP_SOURCE_CLOSURE_SHA256 =
  "${closure.closureSha256}";

export const CONCERT_GRAND_DSP_SOURCE_CLOSURE = Object.freeze(
  ${JSON.stringify(Object.fromEntries(closure.files), null, 2).split("\n").join("\n  ")} as const,
);
`;

  if (checkOnly) {
    const existing = await readFile(modulePath, "utf8").catch(() => null);
    if (existing === null) {
      throw new Error(`DSP_MODULE_MISSING: ${modulePath}`);
    }
    const existingHash = /CONCERT_GRAND_WASM_SHA256 =\n {2}"([0-9a-f]{64})"/u.exec(
      existing,
    )?.[1];
    if (existingHash !== sha256) {
      throw new Error(
        `DSP_MODULE_DRIFT: checked-in ${existingHash ?? "<none>"} != rebuilt ${sha256}`,
      );
    }
    process.stdout.write(`dsp-check ok sha256=${sha256}\n`);
    return;
  }

  await writeFile(modulePath, generated);
  process.stdout.write(
    `wrote ${modulePath} (${String(wasm.byteLength)} wasm bytes, sha256=${sha256})\n`,
  );
}

if (import.meta.main) await run();
