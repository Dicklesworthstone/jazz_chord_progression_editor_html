import { existsSync } from "node:fs";

type FoundationContract = {
  toolchain: {
    packageManager: string;
    runtimeDependencies: Record<string, string>;
    developmentDependencies: Record<string, string>;
    playwrightNodeMajors: number[];
    preferredNodeVersion: string;
    playwrightForbidsBunNodeShim: boolean;
  };
};

type PackageManifest = {
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export type RealNodeRuntime = {
  path: string;
  version: string;
  major: number;
};

type DoctorFinding = {
  code: string;
  message: string;
  expected?: string;
  actual?: string;
};

const contractUrl = new URL(
  "../tests/fixtures/foundation/foundation-contract.json",
  import.meta.url,
);
const manifestUrl = new URL("../package.json", import.meta.url);

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes).trim();
}

function pathCandidates(): string[] {
  const candidates: string[] = [];
  const explicit = [process.env["JCPE_NODE"], process.env["NODE_BINARY"]];
  for (const value of explicit) {
    if (value) candidates.push(value);
  }

  for (const directory of (process.env["PATH"] ?? "").split(":")) {
    if (directory) candidates.push(`${directory}/node`);
  }

  const home = process.env["HOME"];
  if (home) {
    const nvmDir = `${home}/.nvm/versions/node`;
    if (existsSync(nvmDir)) {
      const nvm = new Bun.Glob("*/bin/node");
      for (const match of nvm.scanSync({ cwd: nvmDir, absolute: true })) {
        candidates.push(match);
      }
    }
    const fnmDir = `${home}/.local/share/fnm/node-versions`;
    if (existsSync(fnmDir)) {
      const fnm = new Bun.Glob("v*/installation/bin/node");
      for (const match of fnm.scanSync({
        cwd: fnmDir,
        absolute: true,
      })) {
        candidates.push(match);
      }
    }
  }

  candidates.push(
    "/opt/homebrew/opt/node@24/bin/node",
    "/opt/homebrew/opt/node@22/bin/node",
    "/opt/homebrew/opt/node@26/bin/node",
    "/usr/local/opt/node@24/bin/node",
    "/usr/local/opt/node@22/bin/node",
    "/usr/local/opt/node@26/bin/node",
    "/usr/local/bin/node",
    "/usr/bin/node",
    "/bin/node",
  );
  return [...new Set(candidates)];
}

function inspectNode(path: string, allowedMajors: ReadonlySet<number>): RealNodeRuntime | null {
  let result: ReturnType<typeof Bun.spawnSync>;
  try {
    result = Bun.spawnSync({
      cmd: [
        path,
        "-p",
        "JSON.stringify({version:process.version,bun:process.versions.bun??null})",
      ],
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch {
    return null;
  }
  if (result.exitCode !== 0) return null;

  try {
    const parsed: unknown = JSON.parse(
      decode(result.stdout ?? new Uint8Array()),
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      !("bun" in parsed)
    ) {
      return null;
    }
    const version = String(parsed.version).replace(/^v/, "");
    const major = Number(version.split(".")[0]);
    if (parsed.bun !== null || !allowedMajors.has(major)) return null;
    return { path, version, major };
  } catch {
    return null;
  }
}

export async function findRealNode(): Promise<RealNodeRuntime> {
  const contract = await Bun.file(contractUrl).json() as FoundationContract;
  const allowed = new Set(contract.toolchain.playwrightNodeMajors);
  for (const candidate of pathCandidates()) {
    const runtime = inspectNode(candidate, allowed);
    if (runtime) return runtime;
  }
  throw new Error(
    `PLAYWRIGHT_RUNTIME_UNSUPPORTED: install real Node ${[
      ...allowed,
    ].join(", ")} or set JCPE_NODE/NODE_BINARY; Bun's node shim is not supported.`,
  );
}

function compareVersionMap(
  expected: Record<string, string>,
  actual: Record<string, string> | undefined,
  path: string,
  findings: DoctorFinding[],
): void {
  const actualMap = actual ?? {};
  const names = [...new Set([...Object.keys(expected), ...Object.keys(actualMap)])].sort();
  for (const name of names) {
    if (expected[name] !== actualMap[name]) {
      findings.push({
        code: "TOOLCHAIN_VERSION_MISMATCH",
        message: `${path}.${name} must use the exact contract version.`,
        expected: expected[name] ?? "<absent>",
        actual: actualMap[name] ?? "<absent>",
      });
    }
  }
}

export async function inspectToolchain(): Promise<{
  schema: "jcpe.toolchain-doctor.v1";
  outcome: "pass" | "fail";
  bun: string;
  node?: RealNodeRuntime;
  findings: DoctorFinding[];
}> {
  const contract = await Bun.file(contractUrl).json() as FoundationContract;
  const manifest = await Bun.file(manifestUrl).json() as PackageManifest;
  const findings: DoctorFinding[] = [];
  const expectedBun = contract.toolchain.packageManager.replace(/^bun@/, "");

  if (Bun.version !== expectedBun) {
    findings.push({
      code: "TOOLCHAIN_VERSION_MISMATCH",
      message: "Bun version does not match packageManager.",
      expected: expectedBun,
      actual: Bun.version,
    });
  }
  if (manifest.packageManager !== contract.toolchain.packageManager) {
    findings.push({
      code: "TOOLCHAIN_VERSION_MISMATCH",
      message: "packageManager must match the foundation contract.",
      expected: contract.toolchain.packageManager,
      actual: manifest.packageManager ?? "<absent>",
    });
  }
  compareVersionMap(
    contract.toolchain.runtimeDependencies,
    manifest.dependencies,
    "dependencies",
    findings,
  );
  compareVersionMap(
    contract.toolchain.developmentDependencies,
    manifest.devDependencies,
    "devDependencies",
    findings,
  );

  let node: RealNodeRuntime | undefined;
  try {
    node = await findRealNode();
  } catch (error) {
    findings.push({
      code: "PLAYWRIGHT_RUNTIME_UNSUPPORTED",
      message: error instanceof Error ? error.message : "No supported Node runtime.",
    });
  }

  findings.sort(
    (left, right) =>
      left.code.localeCompare(right.code) || left.message.localeCompare(right.message),
  );
  return {
    schema: "jcpe.toolchain-doctor.v1",
    outcome: findings.length === 0 ? "pass" : "fail",
    bun: Bun.version,
    ...(node ? { node } : {}),
    findings,
  };
}

if (import.meta.main) {
  try {
    const report = await inspectToolchain();
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.outcome === "pass" ? 0 : 1;
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          schema: "jcpe.toolchain-doctor.v1",
          outcome: "tool-failure",
          message: error instanceof Error ? error.message : "Unknown tool failure.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 2;
  }
}
