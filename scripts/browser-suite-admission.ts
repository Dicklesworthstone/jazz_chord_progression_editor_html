import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:net";
import { basename } from "node:path";
import { promisify } from "node:util";

// A kernel-owned, host-wide development lane. No PID files, stale-lock deletion,
// runtime dependency, or environment-variable bypass. Other checkouts share it.
export const BROWSER_SUITE_PORT = 47831;
export type SuiteProcess = Readonly<{
  pid: number; parentPid: number; started: string; argv: readonly string[];
}>;

export function isBrowserSuiteProcess(argv: readonly string[]): boolean {
  const executable = basename(argv[0] ?? "");
  if (/^(?:node|nodejs)$/u.test(executable)) {
    let index = 1;
    const valueFlags = new Set(["-r", "--require", "--import", "--loader", "--experimental-loader",
      "--conditions", "-C", "--env-file", "--env-file-if-exists", "--inspect-port"]);
    while ((argv[index] ?? "").startsWith("-")) {
      const arg = argv[index++] ?? "";
      if (["-e", "--eval", "-p", "--print"].includes(arg)) return false;
      if (arg === "--") break;
      if (valueFlags.has(arg)) index += 1;
    }
    // Inspect the program being executed, not a CLI path passed as data to
    // our admission bootstrap. Counting waiting bootstraps/Bun wrappers as
    // active suites would cause two honest contenders to refuse each other.
    const arg = argv[index] ?? "", rest = argv.slice(index + 1);
    if (/(?:^|\/)(?:@playwright\/test|playwright)\/cli\.js$/u.test(arg)) return rest[0] === "test";
    if (/(?:^|\/)check-predeploy-playback\.ts$/u.test(arg)) return true;
    if (/\/playwright\/lib\/(?:common\/process|worker\/workerProcessEntry)\.js$/u.test(arg)) return true;
  }
  // Reparented browser children still consume the lane after a runner dies.
  // Cache paths and --remote-debugging-pipe alone also occur in unrelated tools.
  if (argv.some(arg => /(?:^|\/)playwright_(?:chromium|firefox|webkit)dev_profile-/u.test(arg))) return true;
  return executable === "MiniBrowser" && argv.includes("--inspector-pipe");
}

export function unrelatedBrowserSuites(rows: readonly SuiteProcess[], selfPid = process.pid): SuiteProcess[] {
  const byPid = new Map(rows.map(row => [row.pid, row]));
  const ancestors = new Set<number>();
  let pid = selfPid;
  while (pid > 0 && !ancestors.has(pid)) {
    ancestors.add(pid); pid = byPid.get(pid)?.parentPid ?? 0;
  }
  return rows.filter(row => !ancestors.has(row.pid) && isBrowserSuiteProcess(row.argv));
}

function disappeared(error: unknown): boolean {
  return error instanceof Error && "code" in error && ["ENOENT", "ESRCH"].includes(String(error.code));
}

export async function browserProcessSnapshot(): Promise<SuiteProcess[]> {
  if (process.platform === "linux") {
    const ids = (await readdir("/proc")).filter(id => /^\d+$/u.test(id));
    const rows: SuiteProcess[] = [];
    for (let offset = 0; offset < ids.length; offset += 32) {
      const batch = await Promise.all(ids.slice(offset, offset + 32).map(async id => {
        try {
          const path = `/proc/${id}/`, first = await readFile(`${path}stat`, "utf8");
          const argv = (await readFile(`${path}cmdline`, "utf8")).split("\0").filter(Boolean);
          const last = await readFile(`${path}stat`, "utf8");
          const before = first.slice(first.lastIndexOf(")") + 2).split(" ");
          const after = last.slice(last.lastIndexOf(")") + 2).split(" ");
          // A PID can exit and be reused between reads. No stale identity is admitted.
          if (before[19] !== after[19]) throw new Error(`BROWSER_SUITE_IDENTITY_CHANGED: process ${id} was reused during inventory; run again after it settles`);
          if (after[0] === "Z" || argv.length === 0) return undefined;
          const parentPid = Number(after[1]), started = after[19];
          if (!Number.isSafeInteger(parentPid) || started === undefined) throw new Error(`Malformed process stat: ${id}`);
          return { pid: Number(id), parentPid, started, argv };
        } catch (error) {
          if (disappeared(error)) return undefined;
          throw error;
        }
      }));
      for (const row of batch) if (row !== undefined) rows.push(row);
    }
    return rows.sort((left, right) => left.pid - right.pid);
  }
  if (process.platform !== "darwin") throw new Error(`BROWSER_SUITE_PLATFORM: unsupported process inventory on ${process.platform}`);
  const { stdout } = await promisify(execFile)("ps", ["-axo", "pid=,ppid=,lstart=,command="],
    { env: { ...process.env, LC_ALL: "C" }, maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim().split("\n").map(line => {
    const fields = line.trim().split(/\s+/u);
    return { pid: Number(fields[0]), parentPid: Number(fields[1]), started: fields.slice(2, 7).join(" "), argv: fields.slice(7) };
  });
}

export async function assertBrowserLaneFree(): Promise<void> {
  const active = unrelatedBrowserSuites(await browserProcessSnapshot());
  if (active.length > 0) throw new Error(`BROWSER_SUITE_ACTIVE: wait for the existing runner/children; no process was stopped. ${JSON.stringify(active)}`);
}

export async function acquireBrowserSuite(port = BROWSER_SUITE_PORT): Promise<Readonly<{ port: number; release(): Promise<void> }>> {
  if (Object.hasOwn(process.versions, "bun") || !/^(?:22|24|26)\./u.test(process.versions.node)) {
    throw new Error("BROWSER_SUITE_NODE: acquisition requires real Node 22, 24 or 26");
  }
  // The actual Node suite process owns this socket, not a parent Bun wrapper.
  // The kernel releases it on normal exit, errors and SIGKILL, without PID reuse
  // hazards. Admission of cooperating launchers is atomic; visible external
  // runners/orphans are checked while holding it. An uncooperative external
  // program starting after the scan cannot be serialized by this protocol.
  const server = createServer(socket => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once("error", error => { reject(new Error(`BROWSER_SUITE_BUSY: cannot acquire host lane ${String(port)}; wait for its owner. ${error.message}`)); });
    server.listen({ port, host: "127.0.0.1", exclusive: true }, resolve);
  });
  const release = (): Promise<void> => new Promise((resolve, reject) => {
    server.close(error => { if (error) reject(error); else resolve(); });
  });
  try {
    await assertBrowserLaneFree();
  } catch (error) {
    await release(); throw error;
  }
  const address = server.address();
  if (address === null || typeof address === "string") { await release(); throw new Error("BROWSER_SUITE_ADDRESS: missing lane address"); }
  server.unref();
  process.stderr.write(`BROWSER_SUITE_ADMITTED ${JSON.stringify({ pid: process.pid, parentPid: process.ppid, port: address.port, entrypoint: process.argv[1] })}\n`);
  return { port: address.port, release };
}
