import { mkdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  CONCERT_GRAND_WASM_BASE64,
  CONCERT_GRAND_WASM_BYTE_LENGTH,
  CONCERT_GRAND_WASM_SHA256,
} from "../src/audio/wasm/concert-grand-wasm";
import {
  PIANO_ATTACK_SAMPLES_ATTRIBUTION,
  PIANO_ATTACK_SAMPLES_BASE64,
  PIANO_ATTACK_SAMPLES_BYTE_LENGTH,
  PIANO_ATTACK_SAMPLES_LICENSE,
  PIANO_ATTACK_SAMPLES_SHA256,
  PIANO_ATTACK_SAMPLE_RATE_HZ,
} from "../src/audio/wasm/piano-attack-samples";
import { inspectArtifact } from "./artifact-policy";
import {
  assertByteEqual,
  atomicWrite,
  hashSourceTree,
  sha256Base64,
  sha256Hex,
  stableJson,
} from "./foundation-io";

type FoundationContract = {
  artifact: {
    source: string;
    inspectionOutput: string;
    canonicalOutput: string;
    outputsMustBeByteIdentical: boolean;
    generatedBanner: string;
    compatMode: string;
    maxUncompressedBytes: number;
    foundationShellMaxBytes: number;
    reservedAtlasBytes: number;
    requiredReports: string[];
    legacyCutoverBaseline: {
      commit: string;
      sha256: string;
      bytes: number;
    };
  };
  toolchain: {
    runtimeDependencies: Record<string, string>;
    wasmCompiledDependencies: Record<string, string>;
  };
};

type ToolchainLedger = {
  records: Array<{
    name: string;
    version: string;
    role: string;
    class: string;
    bundledInArtifact: boolean;
    license: string;
    source: string;
  }>;
};

const OWNED_FAVICON_DATA_URL =
  "data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E";

type EmbeddedAssetRecord = {
  id: string;
  mime: string;
  bytes: number;
  sha256: string;
  source: string;
  license: string;
  /**
   * How the asset lives inside the single-file artifact: `data-url` assets are
   * visible to the markup scanner as passive `data:` URLs; an
   * `inline-script-base64` asset is a byte payload carried as a base64 string
   * constant inside the bundled JavaScript (the embedded wasm module).
   */
  embedding: "data-url" | "inline-script-base64" | "css-data-url";
  generator?: string;
  /** Required credit line for a third-party asset under an attribution license. */
  attribution?: string;
};

export type BuildOptions = {
  root?: string;
  outDir?: string;
  publishRoot?: boolean;
};

function parseOptions(args: readonly string[]): BuildOptions {
  const options: BuildOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item === undefined) break;
    if (item === "--no-publish") {
      options.publishRoot = false;
      continue;
    }
    if (item === "--root" || item === "--out-dir") {
      const value = args[index + 1];
      if (!value) throw new Error(`BUILD_ARGUMENT: missing value for ${item}.`);
      if (item === "--root") options.root = value;
      else options.outDir = value;
      index += 1;
      continue;
    }
    throw new Error(`BUILD_ARGUMENT: unknown argument ${item}.`);
  }
  return options;
}

function inlineContents(html: string, tag: "script" | "style"): string[] {
  const pattern = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const values: string[] = [];
  for (const match of html.matchAll(pattern)) {
    const attributes = match[1] ?? "";
    if (tag === "script" && /\bsrc\s*=/i.test(attributes)) continue;
    values.push(match[2] ?? "");
  }
  return values;
}

async function contentSecurityPolicy(html: string): Promise<{
  value: string;
  scriptHashes: string[];
  styleHashes: string[];
}> {
  const scriptHashes = (
    await Promise.all(inlineContents(html, "script").map(sha256Base64))
  ).sort();
  const styleHashes = (
    await Promise.all(inlineContents(html, "style").map(sha256Base64))
  ).sort();
  const hashSources = (hashes: string[]): string =>
    hashes.length > 0
      ? hashes.map((hash) => `'sha256-${hash}'`).join(" ")
      : "'none'";
  /**
   * `'wasm-unsafe-eval'` authorizes `WebAssembly.instantiate` of the
   * project-owned embedded payload under a hash-based script-src; Chromium,
   * Firefox, and WebKit all require the token for that call. It never
   * authorizes a URL: wasm fetched from anywhere stays blocked by the
   * absence of any network source in this policy.
   */
  const scriptSources =
    scriptHashes.length > 0
      ? `${hashSources(scriptHashes)} 'wasm-unsafe-eval'`
      : "'none'";
  const value = [
    "default-src 'none'",
    `script-src ${scriptSources}`,
    "script-src-attr 'none'",
    `style-src ${hashSources(styleHashes)}`,
    "style-src-attr 'none'",
    "img-src data: blob:",
    "media-src data: blob:",
    "font-src data:",
    "connect-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "manifest-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  return { value, scriptHashes, styleHashes };
}

function safeHtmlComment(value: string): string {
  return value.replaceAll("--", "- -").replace(/\s+$/u, "");
}

const FONT_FACE_DATA_URL = /\/\* (?<id>[a-z0-9-]+): [^*]*\*\/\s*@font-face \{[^}]*?src: url\(data:font\/woff2;base64,(?<base64>[A-Za-z0-9+/=]+)\)/gu;

/**
 * The v2 identity's Archivo/Literata faces travel as data-url payloads inside
 * the generated `src/styles/fonts.css` (see scripts/build-fonts.ts). The
 * build re-derives each payload from that stylesheet, confirms the bytes
 * reached the finalized artifact, and inventories them with OFL provenance.
 */
async function inventoriedFontAssets(
  root: string,
  html: string,
): Promise<EmbeddedAssetRecord[]> {
  const { EMBEDDED_FONT_FACES, FONTS_CSS_PATH, FONTS_CSS_BANNER, generateFontsCss } =
    await import("./build-fonts");
  const cssFile = Bun.file(resolve(root, FONTS_CSS_PATH));
  if (!(await cssFile.exists())) {
    throw new Error("ASSET_FONT_CSS_MISSING: src/styles/fonts.css was not generated.");
  }
  const css = await cssFile.text();
  if (!css.startsWith(FONTS_CSS_BANNER)) {
    throw new Error("ASSET_FONT_CSS_BANNER: fonts.css is missing its generated banner.");
  }
  if (css !== (await generateFontsCss(root))) {
    throw new Error(
      "ASSET_FONT_CSS_DRIFT: fonts.css does not match assets/fonts; " +
        "regenerate with bun scripts/build-fonts.ts.",
    );
  }
  const records: EmbeddedAssetRecord[] = [];
  for (const match of css.matchAll(FONT_FACE_DATA_URL)) {
    const id = match.groups?.["id"];
    const base64 = match.groups?.["base64"];
    if (!id || !base64) continue;
    const face = EMBEDDED_FONT_FACES.find((candidate) => candidate.id === id);
    if (!face) {
      throw new Error(`ASSET_FONT_UNKNOWN: fonts.css carries unregistered face ${id}.`);
    }
    if (!html.includes(base64)) {
      throw new Error(
        `ASSET_FONT_MISSING: the embedded ${id} payload was not bundled.`,
      );
    }
    const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
    records.push({
      id: face.id,
      mime: "font/woff2",
      bytes: bytes.byteLength,
      sha256: await sha256Hex(bytes),
      source: face.source,
      generator: "scripts/build-fonts.ts",
      license: `${face.license} (${face.licenseFile})`,
      embedding: "css-data-url",
    });
  }
  if (records.length !== EMBEDDED_FONT_FACES.length) {
    throw new Error(
      `ASSET_FONT_COUNT: expected ${String(EMBEDDED_FONT_FACES.length)} embedded faces, found ${String(records.length)}.`,
    );
  }
  return records;
}

async function inventoriedEmbeddedAssets(
  html: string,
): Promise<EmbeddedAssetRecord[]> {
  if (!html.includes(`href="${OWNED_FAVICON_DATA_URL}"`)) {
    throw new Error(
      "ASSET_FAVICON_MISSING: the source-owned embedded favicon was not bundled.",
    );
  }
  const comma = OWNED_FAVICON_DATA_URL.indexOf(",");
  const payload = new TextEncoder().encode(
    decodeURIComponent(OWNED_FAVICON_DATA_URL.slice(comma + 1)),
  );

  if (!html.includes(CONCERT_GRAND_WASM_BASE64)) {
    throw new Error(
      "ASSET_WASM_MISSING: the embedded concert-grand wasm payload was not bundled.",
    );
  }
  const wasmBytes = Uint8Array.from(
    Buffer.from(CONCERT_GRAND_WASM_BASE64, "base64"),
  );
  const wasmSha256 = await sha256Hex(wasmBytes);
  if (
    wasmBytes.byteLength !== CONCERT_GRAND_WASM_BYTE_LENGTH ||
    wasmSha256 !== CONCERT_GRAND_WASM_SHA256
  ) {
    throw new Error(
      "ASSET_WASM_DRIFT: the concert-grand wasm base64 does not match its " +
        "pinned sha256/byte length; regenerate with bun scripts/build-dsp.ts.",
    );
  }

  if (!html.includes(PIANO_ATTACK_SAMPLES_BASE64)) {
    throw new Error(
      "ASSET_PIANO_SAMPLES_MISSING: the embedded piano attack payload was not bundled.",
    );
  }
  const pianoBytes = Uint8Array.from(
    Buffer.from(PIANO_ATTACK_SAMPLES_BASE64, "base64"),
  );
  const pianoSha256 = await sha256Hex(pianoBytes);
  if (
    pianoBytes.byteLength !== PIANO_ATTACK_SAMPLES_BYTE_LENGTH ||
    pianoSha256 !== PIANO_ATTACK_SAMPLES_SHA256
  ) {
    throw new Error(
      "ASSET_PIANO_SAMPLES_DRIFT: the piano attack base64 does not match its " +
        "pinned sha256/byte length; regenerate with " +
        "bun scripts/build-piano-samples.ts.",
    );
  }

  /*
   * The sampled upright bass and vibraphone were replaced by physical models
   * (jcpe-sample-elimination-physical-qzgo); their CC0 payloads no longer
   * ship in the artifact, so no bundling assertion or license row remains.
   * The recordings stay in the repository as the replacement gate's corpora.
   */

  return [
    {
      id: "changes-empty-favicon",
      mime: "image/svg+xml",
      bytes: payload.byteLength,
      sha256: await sha256Hex(payload),
      source: "src/index.html#favicon",
      license: "LicenseRef-Project",
      embedding: "data-url",
    },
    {
      id: "concert-grand-dsp-wasm",
      mime: "application/wasm",
      bytes: wasmBytes.byteLength,
      sha256: wasmSha256,
      source: "dsp/concert-grand",
      generator: "scripts/build-dsp.ts",
      license: "MIT (project) + libm MIT OR Apache-2.0",
      embedding: "inline-script-base64",
    },
    {
      id: "salamander-piano-attack-pcm",
      mime: `audio/L16;rate=${String(PIANO_ATTACK_SAMPLE_RATE_HZ)};channels=1`,
      bytes: pianoBytes.byteLength,
      sha256: pianoSha256,
      source: "SalamanderGrandPianoV3_44.1khz16bit",
      generator: "scripts/build-piano-samples.ts",
      license: PIANO_ATTACK_SAMPLES_LICENSE,
      embedding: "inline-script-base64",
      attribution: PIANO_ATTACK_SAMPLES_ATTRIBUTION,
    },
  ];
}

async function finalizeHtml(
  compiled: string,
  banner: string,
  preactVersion: string,
  preactLicense: string,
): Promise<{
  html: string;
  csp: Awaited<ReturnType<typeof contentSecurityPolicy>>;
}> {
  let body = compiled.trim();
  if (!/^<!doctype html>/i.test(body)) {
    throw new Error("ARTIFACT_DOCTYPE: Bun output must begin with a standards doctype.");
  }
  if (/http-equiv\s*=\s*["']Content-Security-Policy/i.test(body)) {
    throw new Error("ARTIFACT_CSP_DUPLICATE: source HTML must not define the build-owned CSP.");
  }

  const notice = `<!--
Third-party notice: Preact ${preactVersion}, MIT License
${safeHtmlComment(preactLicense)}

Third-party notice: recorded piano attack transients embedded in the audio
engine come from ${PIANO_ATTACK_SAMPLES_ATTRIBUTION},
<https://creativecommons.org/licenses/by/3.0/>. Sliced and re-encoded by
scripts/build-piano-samples.ts; see dist/licenses.json for the payload digest.
-->`;
  body = body.replace(/^<!doctype html>/i, (doctype) => `${doctype}\n${notice}`);
  const csp = await contentSecurityPolicy(body);
  const meta =
    `<meta http-equiv="Content-Security-Policy" content="${csp.value}">`;
  if (!/<head(?:\s[^>]*)?>/i.test(body)) {
    throw new Error("ARTIFACT_HEAD: Bun output must contain a head element.");
  }
  body = body.replace(
    /<head(\s[^>]*)?>/i,
    (head) => `${head}\n${meta}`,
  );
  return { html: `${banner}\n${body}\n`, csp };
}

async function guardCutover(
  canonicalPath: string,
  contract: FoundationContract,
): Promise<"legacy" | "generated" | "new"> {
  const file = Bun.file(canonicalPath);
  if (!(await file.exists())) return "new";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const textPrefix = new TextDecoder().decode(bytes.slice(0, 160));
  if (textPrefix.startsWith(contract.artifact.generatedBanner)) return "generated";

  const hash = await sha256Hex(bytes);
  const baseline = contract.artifact.legacyCutoverBaseline;
  if (bytes.length === baseline.bytes && hash === baseline.sha256) return "legacy";
  throw new Error(
    `ARTIFACT_CUTOVER_REFUSED: ${canonicalPath} is neither the recorded legacy baseline nor a generated artifact.`,
  );
}

async function runBunBuild(root: string, stagingDir: string): Promise<string> {
  await mkdir(stagingDir, { recursive: true });
  const child = Bun.spawn({
    cmd: [
      process.execPath,
      "build",
      "--compile",
      "--target=browser",
      "--outdir",
      stagingDir,
      "--minify-whitespace",
      "--minify-syntax",
      /**
       * Identifier mangling is deterministic for a fixed input, so it keeps
       * the reproducibility and CSP-hash gates intact while reclaiming the
       * artifact headroom the studio needs. Inspectability of the release
       * bundle is not a project contract: `src/` is authoritative, the
       * generated banner points at it, and every embedded asset, license and
       * hash stays recorded in `dist/standalone-manifest.json`.
       */
      "--minify-identifiers",
      "--sourcemap=none",
      "--packages=bundle",
      "--reject-unresolved",
      "src/index.html",
    ],
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      TZ: "UTC",
      LC_ALL: "C",
      LANG: "C",
      SOURCE_DATE_EPOCH: "0",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `BUN_BUILD_FAILED (${String(exitCode)})\n${stdout.trim()}\n${stderr.trim()}`,
    );
  }

  const outputs: string[] = [];
  const glob = new Bun.Glob("**/*");
  for await (const path of glob.scan({ cwd: stagingDir, onlyFiles: true })) {
    outputs.push(path.replaceAll("\\", "/"));
  }
  outputs.sort();
  if (JSON.stringify(outputs) !== JSON.stringify(["index.html"])) {
    throw new Error(
      `ARTIFACT_RUNTIME_SIDECAR: expected only index.html, got ${outputs.join(", ")}.`,
    );
  }
  return await Bun.file(resolve(stagingDir, "index.html")).text();
}

export async function buildStandalone(options: BuildOptions = {}): Promise<{
  artifactPath: string;
  manifestPath: string;
  hash: string;
  bytes: number;
  cutover: "legacy" | "generated" | "new" | "not-published";
}> {
  const root = resolve(options.root ?? process.cwd());
  const contract = await Bun.file(
    resolve(root, "tests/fixtures/foundation/foundation-contract.json"),
  ).json() as FoundationContract;
  const ledger = await Bun.file(
    resolve(root, "tests/fixtures/foundation/toolchain-ledger.json"),
  ).json() as ToolchainLedger;
  const sourceRoot = resolve(root, "src");
  const sourceHash = await hashSourceTree(sourceRoot);
  const rootHash = await sha256Hex(root);
  const stagingDir = resolve(
    process.env["TMPDIR"] ?? "/tmp",
    `jcpe-standalone-${sourceHash.slice(0, 12)}-${rootHash.slice(0, 8)}`,
  );
  const compiled = await runBunBuild(root, stagingDir);

  const preactVersion = contract.toolchain.runtimeDependencies["preact"];
  if (!preactVersion) {
    throw new Error("LICENSE_PREACT_VERSION: contract is missing Preact.");
  }
  const preactLicensePath = resolve(root, "node_modules/preact/LICENSE");
  if (!(await Bun.file(preactLicensePath).exists())) {
    throw new Error(
      "LICENSE_PREACT_MISSING: run bun install --frozen-lockfile before build.",
    );
  }
  const preactLicense = await Bun.file(preactLicensePath).text();
  const finalized = await finalizeHtml(
    compiled,
    contract.artifact.generatedBanner,
    preactVersion,
    preactLicense,
  );
  const encoded = new TextEncoder().encode(finalized.html);
  const inspection = inspectArtifact(finalized.html, {
    maxBytes: contract.artifact.maxUncompressedBytes,
    shellMaxBytes: contract.artifact.foundationShellMaxBytes,
    requireReleaseEnvelope: true,
  });
  if (inspection.findings.length > 0) {
    throw new Error(
      `ARTIFACT_POLICY_FAILED\n${JSON.stringify(inspection.findings, null, 2)}`,
    );
  }
  const embeddedAssets = [
    ...(await inventoriedEmbeddedAssets(finalized.html)),
    ...(await inventoriedFontAssets(root, finalized.html)),
  ];
  // The markup scanner can only see attribute-level data: URLs; script-carried
  // payloads (the wasm module) and CSS-carried font payloads are verified
  // byte-for-byte above instead.
  const markupVisibleAssets = embeddedAssets.filter(
    (asset) => asset.embedding === "data-url",
  );
  if (inspection.html.embeddedAssets !== markupVisibleAssets.length) {
    throw new Error(
      "ASSET_INVENTORY_MISMATCH: every embedded artifact asset must have provenance.",
    );
  }

  const artifactHash = await sha256Hex(encoded);
  const outDir = resolve(options.outDir ?? resolve(root, "dist"));
  const inspectionPath = resolve(outDir, basename(contract.artifact.inspectionOutput));
  const canonicalPath = resolve(root, contract.artifact.canonicalOutput);
  const manifestPath = resolve(outDir, "standalone-manifest.json");
  const licensesPath = resolve(outDir, "licenses.json");
  const publishRoot = options.publishRoot ?? true;
  const cutover = publishRoot
    ? await guardCutover(canonicalPath, contract)
    : "not-published";

  const preactLedger = ledger.records.find((record) => record.name === "preact");
  if (!preactLedger || preactLedger.version !== preactVersion) {
    throw new Error("LICENSE_PREACT_LEDGER: Preact ledger does not match contract.");
  }
  const licenseRecord = {
    name: preactLedger.name,
    version: preactLedger.version,
    license: preactLedger.license,
    source: preactLedger.source,
    bundledInArtifact: true,
    noticeEmbedded: true,
    licenseTextSha256: await sha256Hex(preactLicense),
  };

  const libmVersion = contract.toolchain.wasmCompiledDependencies["libm"];
  if (!libmVersion) {
    throw new Error("LICENSE_LIBM_VERSION: contract is missing libm.");
  }
  const libmLedger = ledger.records.find((record) => record.name === "libm");
  if (!libmLedger || libmLedger.version !== libmVersion) {
    throw new Error("LICENSE_LIBM_LEDGER: libm ledger does not match contract.");
  }
  // Not a JS package: libm is Rust code compiled into the embedded wasm
  // payload, so it is inventoried separately and `packages` stays Preact-only.
  const wasmCompiledRecord = {
    name: libmLedger.name,
    version: libmLedger.version,
    license: libmLedger.license,
    source: libmLedger.source,
    bundledInArtifact: true,
    embedding: "compiled-into-wasm",
    description:
      "Rust software floating-point library compiled into the embedded " +
      "concert-grand WebAssembly payload by scripts/build-dsp.ts; " +
      "not a JavaScript dependency.",
  };

  const licenses = {
    schemaVersion: 1,
    packages: [licenseRecord],
    wasmCompiled: [wasmCompiledRecord],
    assets: embeddedAssets,
  };
  const manifest = {
    schemaVersion: 1,
    artifact: {
      path: contract.artifact.canonicalOutput,
      sha256: artifactHash,
      bytes: encoded.byteLength,
      budgetBytes: contract.artifact.maxUncompressedBytes,
      remainingBytes: contract.artifact.maxUncompressedBytes - encoded.byteLength,
      foundationShellBudgetBytes: contract.artifact.foundationShellMaxBytes,
      reservedAtlasBytes: contract.artifact.reservedAtlasBytes,
      rootEqualsDist: true,
    },
    build: {
      bunVersion: Bun.version,
      target: "browser",
      canonicalPlatform: `${process.platform}-${process.arch}`,
      sourceSha256: sourceHash,
    },
    html: {
      generatedBanner: contract.artifact.generatedBanner,
      compatModeExpected: contract.artifact.compatMode,
      inlineScriptCount: inlineContents(finalized.html, "script").length,
      inlineStyleCount: inlineContents(finalized.html, "style").length,
      embeddedAssetCount: embeddedAssets.length,
      csp: {
        scriptHashes: finalized.csp.scriptHashes,
        styleHashes: finalized.csp.styleHashes,
      },
      forbiddenReferences: [],
    },
    licenses: [licenseRecord],
    wasmCompiled: [wasmCompiledRecord],
    assets: embeddedAssets,
  };

  await atomicWrite(inspectionPath, encoded);
  await atomicWrite(licensesPath, stableJson(licenses));
  await atomicWrite(manifestPath, stableJson(manifest));
  if (publishRoot) {
    await atomicWrite(canonicalPath, encoded);
    if (contract.artifact.outputsMustBeByteIdentical) {
      await assertByteEqual(inspectionPath, canonicalPath);
    }
  }

  return {
    artifactPath: publishRoot ? canonicalPath : inspectionPath,
    manifestPath,
    hash: artifactHash,
    bytes: encoded.byteLength,
    cutover,
  };
}

if (import.meta.main) {
  try {
    const result = await buildStandalone(parseOptions(Bun.argv.slice(2)));
    console.log(
      JSON.stringify(
        {
          schema: "jcpe.build.v1",
          outcome: "pass",
          ...result,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          schema: "jcpe.build.v1",
          outcome: "fail",
          message: error instanceof Error ? error.message : "Unknown build failure.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}
