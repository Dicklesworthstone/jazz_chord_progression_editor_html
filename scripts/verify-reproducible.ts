import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  utimes,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildStandalone } from "./build";
import { assertByteEqual, sha256Hex } from "./foundation-io";

async function copyBuildInputs(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  await Promise.all([
    cp(join(source, "src"), join(target, "src"), { recursive: true }),
    cp(
      join(source, "tests/fixtures/foundation"),
      join(target, "tests/fixtures/foundation"),
      { recursive: true },
    ),
    cp(join(source, "package.json"), join(target, "package.json")),
    cp(join(source, "bun.lock"), join(target, "bun.lock")),
    cp(join(source, "bunfig.toml"), join(target, "bunfig.toml")),
    symlink(join(source, "node_modules"), join(target, "node_modules"), "dir"),
  ]);
}

async function varySourceTimes(root: string, seconds: number): Promise<void> {
  const glob = new Bun.Glob("**/*");
  for await (const path of glob.scan({ cwd: join(root, "src"), onlyFiles: true })) {
    await utimes(join(root, "src", path), seconds, seconds);
  }
}

export async function verifyReproducible(): Promise<{
  schema: "jcpe.verify-reproducible.v1";
  outcome: "pass";
  sha256: string;
  bytes: number;
  rootsDiffered: true;
  mtimesDiffered: true;
}> {
  const source = process.cwd();
  if (!(await Bun.file("bun.lock").exists()) || !(await Bun.file("package.json").exists())) {
    throw new Error("REPRO_INPUT_MISSING: package.json and bun.lock are required.");
  }
  const reproducibilityRoot = resolve("test-results/reproducibility");
  await mkdir(reproducibilityRoot, { recursive: true });
  const base = await mkdtemp(join(reproducibilityRoot, "run-"));
  const first = join(base, "checkout alpha");
  const second = join(base, "a deeper checkout", "checkout β");
  await copyBuildInputs(source, first);
  await copyBuildInputs(source, second);
  await varySourceTimes(first, 1_000);
  await varySourceTimes(second, 2_000);

  const [firstBuild, secondBuild] = await Promise.all([
    buildStandalone({
      root: first,
      outDir: join(first, "dist"),
      publishRoot: false,
    }),
    buildStandalone({
      root: second,
      outDir: join(second, "dist"),
      publishRoot: false,
    }),
  ]);
  await assertByteEqual(firstBuild.artifactPath, secondBuild.artifactPath);
  await assertByteEqual(firstBuild.manifestPath, secondBuild.manifestPath);
  await assertByteEqual(
    firstBuild.artifactPath,
    join(source, "jazz_chord_progression_editor.html"),
  );
  await assertByteEqual(firstBuild.artifactPath, join(source, "dist/index.html"));
  await assertByteEqual(
    firstBuild.manifestPath,
    join(source, "dist/standalone-manifest.json"),
  );
  await assertByteEqual(
    join(first, "dist/licenses.json"),
    join(second, "dist/licenses.json"),
  );
  await assertByteEqual(
    join(first, "dist/licenses.json"),
    join(source, "dist/licenses.json"),
  );

  const firstBytes = new Uint8Array(await readFile(firstBuild.artifactPath));
  return {
    schema: "jcpe.verify-reproducible.v1",
    outcome: "pass",
    sha256: await sha256Hex(firstBytes),
    bytes: firstBytes.byteLength,
    rootsDiffered: true,
    mtimesDiffered: true,
  };
}

if (import.meta.main) {
  try {
    console.log(JSON.stringify(await verifyReproducible(), null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          schema: "jcpe.verify-reproducible.v1",
          outcome: "fail",
          message:
            error instanceof Error ? error.message : "Unknown reproducibility failure.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}
