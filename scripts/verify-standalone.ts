import { resolve } from "node:path";
import { inspectArtifact, assertArtifactInspection } from "./artifact-policy";
import { assertByteEqual, hashSourceTree, sha256Hex } from "./foundation-io";

type FoundationContract = {
  artifact: {
    canonicalOutput: string;
    inspectionOutput: string;
    maxUncompressedBytes: number;
    foundationShellMaxBytes: number;
  };
};

type StandaloneManifest = {
  schemaVersion: number;
  artifact: {
    path: string;
    sha256: string;
    bytes: number;
    rootEqualsDist: boolean;
  };
  build: {
    sourceSha256: string;
  };
  html: {
    embeddedAssetCount: number;
    forbiddenReferences: unknown[];
  };
  assets: unknown[];
};

type LicenseReport = { assets: unknown[] };

export async function verifyStandalone(root = process.cwd()): Promise<{
  schema: "jcpe.verify-standalone.v1";
  outcome: "pass";
  bytes: number;
  sha256: string;
  sourceSha256: string;
  findings: [];
}> {
  const projectRoot = resolve(root);
  const contract = await Bun.file(
    resolve(
      projectRoot,
      "tests/fixtures/foundation/foundation-contract.json",
    ),
  ).json() as FoundationContract;
  const rootPath = resolve(projectRoot, contract.artifact.canonicalOutput);
  const distPath = resolve(projectRoot, contract.artifact.inspectionOutput);
  const manifestPath = resolve(projectRoot, "dist/standalone-manifest.json");
  const licensesPath = resolve(projectRoot, "dist/licenses.json");
  const required = [rootPath, distPath, manifestPath, licensesPath];
  for (const path of required) {
    if (!(await Bun.file(path).exists())) {
      throw new Error(`ARTIFACT_MISSING: ${path}`);
    }
  }

  await assertByteEqual(rootPath, distPath);
  const bytes = new Uint8Array(await Bun.file(rootPath).arrayBuffer());
  const html = new TextDecoder().decode(bytes);
  const inspection = inspectArtifact(html, {
    maxBytes: contract.artifact.maxUncompressedBytes,
    shellMaxBytes: contract.artifact.foundationShellMaxBytes,
    requireReleaseEnvelope: true,
  });
  assertArtifactInspection(inspection);

  const manifest = await Bun.file(manifestPath).json() as StandaloneManifest;
  const licenses = await Bun.file(licensesPath).json() as LicenseReport;
  const sha256 = await sha256Hex(bytes);
  const sourceSha256 = await hashSourceTree(resolve(projectRoot, "src"));
  const mismatches: string[] = [];
  if (manifest.schemaVersion !== 1) {
    mismatches.push(
      `schemaVersion must be 1 (received ${String(manifest.schemaVersion)})`,
    );
  }
  if (manifest.artifact.path !== contract.artifact.canonicalOutput) {
    mismatches.push(
      `artifact.path must be ${contract.artifact.canonicalOutput} ` +
        `(received ${manifest.artifact.path})`,
    );
  }
  if (manifest.artifact.sha256 !== sha256) {
    mismatches.push(
      `artifact.sha256 does not match the canonical artifact ` +
        `(manifest ${manifest.artifact.sha256}; actual ${sha256})`,
    );
  }
  if (manifest.artifact.bytes !== bytes.byteLength) {
    mismatches.push(
      `artifact.bytes does not match the canonical artifact ` +
        `(manifest ${String(manifest.artifact.bytes)}; actual ${String(bytes.byteLength)})`,
    );
  }
  if (!manifest.artifact.rootEqualsDist) {
    mismatches.push("artifact.rootEqualsDist must be true");
  }
  if (manifest.build.sourceSha256 !== sourceSha256) {
    mismatches.push(
      `build.sourceSha256 does not match the current src tree ` +
        `(manifest ${manifest.build.sourceSha256}; actual ${sourceSha256})`,
    );
  }
  if (manifest.html.forbiddenReferences.length !== 0) {
    mismatches.push(
      `html.forbiddenReferences must be empty ` +
        `(received ${String(manifest.html.forbiddenReferences.length)} findings)`,
    );
  }
  if (manifest.html.embeddedAssetCount !== manifest.assets.length) {
    mismatches.push(
      `html.embeddedAssetCount does not match assets.length ` +
        `(manifest ${String(manifest.html.embeddedAssetCount)}; ` +
        `assets ${String(manifest.assets.length)})`,
    );
  }
  if (JSON.stringify(manifest.assets) !== JSON.stringify(licenses.assets)) {
    mismatches.push("manifest assets do not match dist/licenses.json assets");
  }
  if (mismatches.length > 0) {
    throw new Error(`ARTIFACT_MANIFEST_STALE: ${mismatches.join("; ")}.`);
  }

  return {
    schema: "jcpe.verify-standalone.v1",
    outcome: "pass",
    bytes: bytes.byteLength,
    sha256,
    sourceSha256,
    findings: [],
  };
}

if (import.meta.main) {
  try {
    const args = Bun.argv.slice(2);
    const staticOnly = args.length === 1 && args[0] === "--static-only";
    if (!staticOnly && args.length > 0) {
      throw new Error(
        `VERIFY_STANDALONE_ARGUMENT: expected --static-only or no arguments; got ${args.join(" ")}.`,
      );
    }
    console.log(JSON.stringify(await verifyStandalone(), null, 2));
    if (!staticOnly) {
      const child = Bun.spawn({
        cmd: [
          process.execPath,
          "scripts/run-playwright.ts",
          "test",
          "tests/e2e/standalone-offline.spec.ts",
          "tests/e2e/offline-harness.spec.ts",
          "tests/e2e/accessibility.spec.ts",
        ],
        cwd: process.cwd(),
        env: process.env,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      const exitCode = await child.exited;
      if (exitCode !== 0) process.exit(exitCode);
    }
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          schema: "jcpe.verify-standalone.v1",
          outcome: "fail",
          message:
            error instanceof Error ? error.message : "Unknown standalone failure.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}
