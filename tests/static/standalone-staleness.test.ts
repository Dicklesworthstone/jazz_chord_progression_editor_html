import {
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { buildStandalone } from "../../scripts/build";
import { verifyStandalone } from "../../scripts/verify-standalone";

setDefaultTimeout(60_000);

const checkoutSource = process.cwd();
const canonicalArtifact = "jazz_chord_progression_editor.html";
const inspectionArtifact = "dist/index.html";

let builtCheckout: string | undefined;
let mutationRoot: string | undefined;

function requirePath(value: string | undefined, label: string): string {
  if (!value) throw new Error(`TEST_SETUP_MISSING: ${label}.`);
  return value;
}

async function copyBuildInputs(target: string): Promise<void> {
  await Promise.all([
    mkdir(join(target, "tests/fixtures"), { recursive: true }),
    mkdir(target, { recursive: true }),
  ]);
  await Promise.all([
    cp(join(checkoutSource, "src"), join(target, "src"), { recursive: true }),
    /* Embedded-font binaries are build inputs: the build re-derives
       src/styles/fonts.css from them and refuses on drift. */
    cp(join(checkoutSource, "assets"), join(target, "assets"), {
      recursive: true,
    }),
    cp(
      join(checkoutSource, "tests/fixtures/foundation"),
      join(target, "tests/fixtures/foundation"),
      { recursive: true },
    ),
    cp(join(checkoutSource, "package.json"), join(target, "package.json")),
    cp(join(checkoutSource, "bun.lock"), join(target, "bun.lock")),
    cp(join(checkoutSource, "bunfig.toml"), join(target, "bunfig.toml")),
    symlink(
      join(checkoutSource, "node_modules"),
      join(target, "node_modules"),
      "dir",
    ),
  ]);
}

async function copyVerificationInputs(label: string): Promise<string> {
  const source = requirePath(builtCheckout, "built checkout");
  const root = join(requirePath(mutationRoot, "mutation root"), label);
  await mkdir(join(root, "tests/fixtures"), { recursive: true });
  await Promise.all([
    cp(join(source, "src"), join(root, "src"), { recursive: true }),
    cp(
      join(source, "tests/fixtures/foundation"),
      join(root, "tests/fixtures/foundation"),
      { recursive: true },
    ),
    cp(join(source, "dist"), join(root, "dist"), { recursive: true }),
    cp(join(source, canonicalArtifact), join(root, canonicalArtifact)),
  ]);
  return root;
}

async function mutateOneTitleByte(path: string): Promise<{
  byteLengthDelta: number;
  differingBytes: number;
}> {
  /* The product title (eb22085): the one string every page variant carries. */
  const marker = "<title>JazzChords";
  const source = await readFile(path, "utf8");
  if (!source.includes(marker)) {
    throw new Error(`TEST_MUTATION_MARKER_MISSING: ${path}.`);
  }
  const mutated = source.replace(marker, "<title>JazzChorde");
  const sourceBytes = new TextEncoder().encode(source);
  const mutatedBytes = new TextEncoder().encode(mutated);
  let differingBytes = 0;
  for (let index = 0; index < sourceBytes.length; index += 1) {
    if (sourceBytes.at(index) !== mutatedBytes.at(index)) differingBytes += 1;
  }
  await writeFile(path, mutated, "utf8");
  return {
    byteLengthDelta: mutatedBytes.byteLength - sourceBytes.byteLength,
    differingBytes,
  };
}

async function rejectionMessage(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("TEST_EXPECTED_REJECTION: verifier unexpectedly passed.");
}

beforeAll(async () => {
  const ignoredRoot = resolve(".tmp/standalone-staleness");
  await mkdir(ignoredRoot, { recursive: true });
  mutationRoot = await mkdtemp(join(ignoredRoot, "run-"));
  builtCheckout = join(mutationRoot, "pristine real build");
  await copyBuildInputs(builtCheckout);
  await buildStandalone({ root: builtCheckout });
}, 30_000);

describe("standalone source/artifact staleness guard", () => {
  test("accepts a real standalone build from an explicit checkout root", async () => {
    const result = await verifyStandalone(
      requirePath(builtCheckout, "built checkout"),
    );
    expect(result).toMatchObject({
      schema: "jcpe.verify-standalone.v1",
      outcome: "pass",
      findings: [],
    });
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test("rejects a one-byte canonical mutation before trusting the manifest", async () => {
    const root = await copyVerificationInputs("canonical byte mutation");
    const mutation = await mutateOneTitleByte(join(root, canonicalArtifact));
    expect(mutation).toEqual({ byteLengthDelta: 0, differingBytes: 1 });

    expect(await rejectionMessage(() => verifyStandalone(root))).toMatch(
      /ARTIFACT_STALE: .*jazz_chord_progression_editor\.html and .*dist\/index\.html are not byte-identical\./,
    );
  });

  test("rejects an equal root/dist mutation through the artifact hash", async () => {
    const root = await copyVerificationInputs("equal artifact mutation");
    const rootMutation = await mutateOneTitleByte(join(root, canonicalArtifact));
    const distMutation = await mutateOneTitleByte(join(root, inspectionArtifact));
    expect(rootMutation).toEqual({ byteLengthDelta: 0, differingBytes: 1 });
    expect(distMutation).toEqual(rootMutation);

    expect(await rejectionMessage(() => verifyStandalone(root))).toMatch(
      /ARTIFACT_MANIFEST_STALE: artifact\.sha256 does not match the canonical artifact \(manifest [0-9a-f]{64}; actual [0-9a-f]{64}\)\./,
    );
  });

  test("rejects a stale source/artifact pair through the source-tree hash", async () => {
    const root = await copyVerificationInputs("source artifact stale pair");
    const mutation = await mutateOneTitleByte(join(root, "src/index.html"));
    expect(mutation).toEqual({ byteLengthDelta: 0, differingBytes: 1 });

    expect(await rejectionMessage(() => verifyStandalone(root))).toMatch(
      /ARTIFACT_MANIFEST_STALE: build\.sourceSha256 does not match the current src tree \(manifest [0-9a-f]{64}; actual [0-9a-f]{64}\)\./,
    );
  }, 60_000);
});
