import { mkdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
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
  const value = [
    "default-src 'none'",
    `script-src ${hashSources(scriptHashes)}`,
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
  return [
    {
      id: "changes-empty-favicon",
      mime: "image/svg+xml",
      bytes: payload.byteLength,
      sha256: await sha256Hex(payload),
      source: "src/index.html#favicon",
      license: "LicenseRef-Project",
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
  const embeddedAssets = await inventoriedEmbeddedAssets(finalized.html);
  if (inspection.html.embeddedAssets !== embeddedAssets.length) {
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
  const licenses = {
    schemaVersion: 1,
    packages: [licenseRecord],
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
      embeddedAssetCount: inspection.html.embeddedAssets,
      csp: {
        scriptHashes: finalized.csp.scriptHashes,
        styleHashes: finalized.csp.styleHashes,
      },
      forbiddenReferences: [],
    },
    licenses: [licenseRecord],
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
