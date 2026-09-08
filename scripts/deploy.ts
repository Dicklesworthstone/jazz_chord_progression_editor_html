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
import { assertBrowserLaneFree } from "./browser-suite-admission";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ARTIFACT_PATH = "jazz_chord_progression_editor.html";
const OG_IMAGE_PATH = "deploy-assets/og-image.png";
const CF_PROJECT = "jazz-chord-progression-editor-html";
const CF_ACCOUNT = "abb7d369730a2d0adcb077c8147384e0";
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
  options: Readonly<{ cwd?: string; label: string; env?: NodeJS.ProcessEnv }>,
): Promise<Readonly<{ exitCode: number; stdout: string; stderr: string }>> {
  const child = Bun.spawn([...command], {
    cwd: options.cwd ?? root,
    stdout: "pipe",
    stderr: "pipe",
    env: options.env ?? process.env,
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
  throw new Error(`DEPLOY REFUSED: ${message}`);
}

async function cloudflarePagesEnvironment(): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CLOUDFLARE_ACCOUNT_ID: CF_ACCOUNT,
    CI: "true",
    WRANGLER_SEND_METRICS: "false",
  };
  const authKeys = [
    "CLOUDFLARE_API_TOKEN", "CF_API_TOKEN",
    "CLOUDFLARE_API_KEY", "CF_API_KEY",
    "CLOUDFLARE_EMAIL", "CF_EMAIL",
  ];
  const probe = async (candidate: NodeJS.ProcessEnv) => spawnText(
    ["wrangler", "pages", "deployment", "list", `--project-name=${CF_PROJECT}`],
    { label: "cloudflare-pages-auth", env: candidate },
  );
  const selected = await probe(env);
  if (selected.exitCode === 0) return env;
  process.stderr.write(selected.stdout + selected.stderr);

  // A valid token for another Cloudflare service can lack Pages access and
  // takes precedence over a perfectly usable Wrangler login. Test the saved
  // login against this exact account/project before selecting it for upload.
  if (authKeys.some((key) => Boolean(env[key]))) {
    const oauthEnv = Object.fromEntries(
      Object.entries(env).filter(([key]) => !authKeys.includes(key)),
    );
    process.stderr.write("Pages rejected environment credentials; checking saved Wrangler login.\n");
    const oauth = await probe(oauthEnv);
    if (oauth.exitCode === 0) {
      process.stdout.write("Cloudflare Pages access verified using saved Wrangler login.\n");
      return oauthEnv;
    }
    process.stderr.write(oauth.stdout + oauth.stderr);
  }
  return fail(
    "Cloudflare Pages authorization failed before release gates or uploads. " +
    "An active API token can still lack Pages permissions. Restore Account > " +
    "Cloudflare Pages > Edit for the project account, or authenticate with " +
    "`env -u CLOUDFLARE_API_TOKEN -u CF_API_TOKEN -u CLOUDFLARE_API_KEY " +
    "-u CF_API_KEY -u CLOUDFLARE_EMAIL -u CF_EMAIL wrangler login --device`. " +
    "Then rerun bun run deploy; no global shell credentials need changing.",
  );
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

  // Cheap preflight; the actual Node playback gate also acquires the atomic lane.
  await assertBrowserLaneFree();

  // Fail cheaply on the real Pages endpoint, not after all instrument gates.
  // Check-only remains usable offline and never needs host credentials.
  const pagesEnv = checkOnly ? undefined : await cloudflarePagesEnvironment();

  /* 3a. The public predeploy command includes model acceptance and quality. */
  const acceptance = await spawnText(["bun", "run", "predeploy:check"], {
    label: "check-predeploy",
  });
  process.stderr.write(acceptance.stderr);
  process.stdout.write(acceptance.stdout);
  if (acceptance.exitCode !== 0) fail("model-acceptance/instrument-quality gate is red");

  /* Assemble the deploy directory from committed bytes. */
  const artifactBytes = await gitShowBytes(ARTIFACT_PATH);
  const artifactSha256 = sha256Hex(artifactBytes);
  const stage = await mkdtemp(join(tmpdir(), "jcpe-deploy-"));
  try {
    const upload = join(stage, "public");
    await mkdir(upload);
    await writeFile(join(upload, "index.html"), artifactBytes);
    await writeFile(join(upload, "og-image.png"), await gitShowBytes(OG_IMAGE_PATH));
    // Keep the playback ledger outside the upload directory for both hosts.

    /* 3b. Real-browser playback gate against the exact shipped bytes. */
    const nodeBinary = process.env["JCPE_NODE"] ?? process.env["NODE_BINARY"] ?? "node";
    const playbackLedger = join(stage, "playback-gate.json");
    const playback = await spawnText(
      [
        nodeBinary,
        "scripts/check-predeploy-playback.ts",
        join(upload, "index.html"),
        "--json",
        playbackLedger,
      ],
      { label: "playback-gate" },
    );
    process.stderr.write(playback.stderr);
    process.stdout.write(playback.stdout);
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
        upload,
        `--project-name=${CF_PROJECT}`,
        "--branch=main",
        "--commit-dirty=true",
      ],
      { label: "wrangler", ...(pagesEnv === undefined ? {} : { env: pagesEnv }) },
    );
    process.stderr.write(pages.stderr);
    process.stdout.write(pages.stdout);
    if (pages.exitCode !== 0) {
      fail("wrangler pages deploy failed (run `wrangler login` if auth expired)");
    }
    // Create this only after Pages uploaded the two public assets. Vercel link
    // may create .env.local; only the HTML and image are eligible for upload.
    await writeFile(join(upload, ".vercelignore"), "*\n!index.html\n!og-image.png\n");
    const link = await spawnText(
      ["vercel", "link", "--yes", "--project", VERCEL_PROJECT],
      { cwd: upload, label: "vercel-link" },
    );
    if (link.exitCode !== 0) {
      fail("vercel link failed (run `vercel login` if auth expired)");
    }
    const vercel = await spawnText(["vercel", "deploy", "--prod", "--yes"], {
      cwd: upload,
      label: "vercel",
    });
    process.stderr.write(vercel.stderr);
    process.stdout.write(vercel.stdout);
    if (vercel.exitCode !== 0) {
      fail("vercel deploy failed (run `vercel login` if auth expired)");
    }

    /* 5. Poll both hosts for the committed hash. */
    const results: Record<string, string> = {};
    for (const host of HOSTS) {
      let served = "";
      for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
        const response = await fetch(host, {
          redirect: "follow",
          headers: { "User-Agent": "OpenAI File Downloader, XaiImageApiFetch/1.0" },
        });
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

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
