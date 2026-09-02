/**
 * One-command production deploy
 * (bead jcpe-deploy-pipeline-restoration-kbvj.3).
 *
 * Encodes the AGENTS.md deploy discipline as tooling so no step can be
 * forgotten and no upload can outrun a gate:
 *
 *   1. deploys COMMITTED bytes only — the artifact and og-image are read
 *      from `git show HEAD:`, never the working tree, and the run refuses
 *      when the tracked artifact or `src/` differ from HEAD (a tree build
 *      is reproducible from no commit at all; that has shipped before);
 *   2. refuses while another Playwright suite is running (two suites
 *      thrash into flakes);
 *   3. runs the model-acceptance gate (`scripts/check-predeploy.ts`) and
 *      then the real-browser per-instrument playback gate against the
 *      EXACT bytes being shipped — that identity is the hash coupling:
 *      the gate ledger and the upload share one file;
 *   4. uploads to Cloudflare Pages and the Vercel mirror, then polls BOTH
 *      hosts until the served bytes hash-match `git show HEAD` (the custom
 *      domain caches for roughly 30-60 s);
 *   5. prints a machine-readable receipt and, always, the one obligation
 *      tooling cannot discharge: load each host in a real browser at
 *      desktop and phone widths (a matching hash is not a working deploy).
 *
 * Usage:
 *   bun scripts/deploy.ts            # full gated deploy to both hosts
 *   bun scripts/deploy.ts --check    # run every gate, skip the uploads
 *
 * There is deliberately no flag that skips a gate.
 */
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ARTIFACT_PATH = "jazz_chord_progression_editor.html";
const OG_IMAGE_PATH = "deploy-assets/og-image.png";
const CF_PROJECT = "jazz-chord-progression-editor-html";
const VERCEL_PROJECT = "changes-jazz-progression-studio";
const HOSTS = Object.freeze([
  "https://jazzchords.org/",
  "https://changes-jazz-progression-studio.vercel.app/",
] as const);
const POLL_ATTEMPTS = 10;
const POLL_DELAY_MS = 12_000;

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function spawnText(
  command: readonly string[],
  options: Readonly<{ cwd?: string; label: string }>,
): Promise<Readonly<{ exitCode: number; stdout: string; stderr: string }>> {
  const child = Bun.spawn([...command], {
    cwd: options.cwd ?? root,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return Object.freeze({ exitCode, stdout, stderr });
}

async function gitShowBytes(path: string): Promise<Uint8Array> {
  const child = Bun.spawn(["git", "show", `HEAD:${path}`], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [buffer, exitCode] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    child.exited,
  ]);
  if (exitCode !== 0) throw new Error(`DEPLOY_GIT_SHOW_FAILED:${path}`);
  return new Uint8Array(buffer);
}

function fail(message: string): never {
  process.stderr.write(`DEPLOY REFUSED: ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes("--check");

  /* 1. Committed bytes only. */
  const dirty = await spawnText(
    ["git", "diff", "--name-only", "HEAD", "--", ARTIFACT_PATH, "src", OG_IMAGE_PATH],
    { label: "git-diff" },
  );
  if (dirty.exitCode !== 0) fail("git diff against HEAD failed");
  if (dirty.stdout.trim().length > 0) {
    fail(
      "the tracked artifact, src/, or the og-image differ from HEAD — " +
        `commit or discard first (deploys ship git-show bytes only):\n${dirty.stdout}`,
    );
  }
  const head = (
    await spawnText(["git", "rev-parse", "HEAD"], { label: "rev-parse" })
  ).stdout.trim();

  /* 2. Never race a Playwright suite. The pattern names the real suite
   * launchers; a loose `playwright.*test` also matches the unrelated
   * `@playwright/mcp@latest` server (the substring is in "latest"). */
  const suites = await spawnText(
    ["pgrep", "-f", "playwright/test/cli|run-playwright\\.ts test|check-predeploy-playback"],
    { label: "pgrep" },
  );
  if (suites.exitCode === 0 && suites.stdout.trim().length > 0) {
    fail("a Playwright suite is running; chain behind it instead of racing it");
  }

  /* 3a. Model-acceptance gate. */
  const acceptance = await spawnText(["bun", "scripts/check-predeploy.ts"], {
    label: "check-predeploy",
  });
  process.stderr.write(acceptance.stderr);
  process.stdout.write(acceptance.stdout);
  if (acceptance.exitCode !== 0) fail("model-acceptance gate is red");

  /* Assemble the deploy directory from committed bytes. */
  const artifactBytes = await gitShowBytes(ARTIFACT_PATH);
  const artifactSha256 = sha256Hex(artifactBytes);
  const stage = await mkdtemp(join(tmpdir(), "jcpe-deploy-"));
  try {
    await writeFile(join(stage, "index.html"), artifactBytes);
    await writeFile(join(stage, "og-image.png"), await gitShowBytes(OG_IMAGE_PATH));

    /* 3b. Real-browser playback gate against the exact shipped bytes. */
    const nodeBinary = process.env["JCPE_NODE"] ?? process.env["NODE_BINARY"] ?? "node";
    const playbackLedger = join(stage, "playback-gate.json");
    const playback = await spawnText(
      [
        nodeBinary,
        "scripts/check-predeploy-playback.ts",
        join(stage, "index.html"),
        "--json",
        playbackLedger,
      ],
      { label: "playback-gate" },
    );
    process.stderr.write(playback.stderr);
    if (playback.exitCode !== 0) fail("real-browser playback gate is red");

    if (checkOnly) {
      process.stdout.write(
        JSON.stringify(
          {
            schema: "jcpe.deploy.v1",
            mode: "check-only",
            head,
            artifactSha256,
            gates: { modelAcceptance: "pass", playback: "pass" },
          },
          null,
          2,
        ) + "\n",
      );
      return;
    }

    /* 4. Upload: Cloudflare Pages, then the Vercel mirror. */
    const pages = await spawnText(
      [
        "wrangler",
        "pages",
        "deploy",
        stage,
        `--project-name=${CF_PROJECT}`,
        "--branch=main",
        "--commit-dirty=true",
      ],
      { label: "wrangler" },
    );
    process.stderr.write(pages.stderr);
    if (pages.exitCode !== 0) {
      fail("wrangler pages deploy failed (run `wrangler login` if auth expired)");
    }
    const link = await spawnText(
      ["vercel", "link", "--yes", "--project", VERCEL_PROJECT],
      { cwd: stage, label: "vercel-link" },
    );
    if (link.exitCode !== 0) {
      fail("vercel link failed (run `vercel login` if auth expired)");
    }
    const vercel = await spawnText(["vercel", "deploy", "--prod", "--yes"], {
      cwd: stage,
      label: "vercel",
    });
    process.stderr.write(vercel.stderr);
    if (vercel.exitCode !== 0) {
      fail("vercel deploy failed (run `vercel login` if auth expired)");
    }

    /* 5. Poll both hosts for the committed hash. */
    const results: Record<string, string> = {};
    for (const host of HOSTS) {
      let served = "";
      for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
        const response = await fetch(host, { redirect: "follow" });
        served = sha256Hex(new Uint8Array(await response.arrayBuffer()));
        if (served === artifactSha256) break;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, POLL_DELAY_MS));
      }
      results[host] = served;
      if (served !== artifactSha256) {
        fail(
          `${host} still serves ${served.slice(0, 20)}… after ` +
            `${String(POLL_ATTEMPTS)} polls (expected ${artifactSha256.slice(0, 20)}…)`,
        );
      }
    }

    process.stdout.write(
      JSON.stringify(
        {
          schema: "jcpe.deploy.v1",
          mode: "deploy",
          head,
          artifactSha256,
          gates: { modelAcceptance: "pass", playback: "pass" },
          hosts: results,
        },
        null,
        2,
      ) + "\n",
    );
    process.stdout.write(
      "REMAINING HUMAN STEP: load each host in a real browser at desktop " +
        "and phone widths and confirm boot, behavior, and console (only the " +
        "documented Cloudflare beacon CSP error is expected on the custom " +
        "domain). A matching hash is not a working deploy.\n",
    );
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

await main();
