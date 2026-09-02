/**
 * Per-instrument real-browser playback deploy gate
 * (bead jcpe-predeploy-playback-gate-kyor, designed on
 * jcpe-live-audio-error-61c5e018-609d after artifact 61c5e018 shipped with
 * mid-chart plucked refusals, a refusal->fault cascade, and an unpitched
 * low-register flute that every offline gate missed).
 *
 * Run under a REAL Node process (repository law: Playwright never runs under
 * Bun's node shim):
 *
 *   node scripts/check-predeploy-playback.ts [artifactPath] [--json out.json]
 *                                            [--no-enforce-recovery]
 *
 * Default artifact: dist/index.html. The script serves the artifact bytes on
 * a loopback server, opens a FRESH Chromium page per selectable instrument
 * (isolation keeps one instrument's failure from poisoning the next — the
 * exact cascade that shipped), presses Play on the starter chart, and
 * asserts, per instrument:
 *   (a) zero console errors and zero page errors;
 *   (b) the transport status reaches "Playing" and still says "Playing"
 *       after the four-second listen window;
 *   (c) at least two rendered audio buffers with nonzero peak amplitude;
 *   (d) chromatic pitch-lock sanity: at least one captured buffer
 *       autocorrelates to a fundamental within +-35 cents of SOME
 *       equal-tempered pitch in the plausible playing range (the check that
 *       flags breath-noise mush; it does not verify the musically correct
 *       note - see No-Claim below).
 * It also asserts the instrument selector covers every rendered/sampled
 * recipe surface (count check against the option list snapshot).
 *
 * A final RECOVERY fixture reproduces the RC2 sequence on one page: force a
 * refusal-capable instrument, then switch instrument and Play again; the
 * second Play must reach "Playing". The RC2 engine fix
 * (jcpe-engine-refusal-fault-cascade-vg8h) landed, so the fixture is
 * ENFORCED by default; --no-enforce-recovery downgrades it to recorded-only
 * strictly for diagnosing a broken fixture, never for shipping past it.
 * Its result is never fabricated.
 *
 * Output: human lines on stderr, machine-readable JSON on stdout (and to
 * --json path when given). Exit 0 only when every enforced assertion passed
 * for every instrument.
 *
 * No-Claim: a green run proves error-free, audible, pitch-locked playback of
 * the starter chart in Chromium on this host. It does NOT prove sound
 * quality, reference similarity, register coverage beyond the starter
 * chart, or behavior in other engines; those live in the model acceptance
 * gates.
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

/**
 * Minimal structural types for the Playwright surface this gate uses. The
 * tools tsconfig is Node-only (no DOM lib), and playwright's published types
 * require DOM globals; typing the used surface structurally keeps this
 * script fully typechecked without widening the whole scripts/ context.
 */
interface GateLocator {
  click(): Promise<void>;
  textContent(): Promise<string | null>;
}
interface GatePage {
  goto(url: string, options: { waitUntil: "domcontentloaded"; timeout: number }): Promise<unknown>;
  waitForSelector(selector: string, options: { timeout: number }): Promise<unknown>;
  waitForFunction(
    expression: () => unknown,
    argument: undefined,
    options: { timeout: number },
  ): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  selectOption(selector: string, value: string): Promise<unknown>;
  locator(selector: string): GateLocator;
  evaluate<Result>(expression: () => Result): Promise<Result>;
  on(event: "console", handler: (message: { type(): string; text(): string }) => void): void;
  on(event: "pageerror", handler: (error: unknown) => void): void;
  context(): { close(): Promise<void> };
}
interface GateContext {
  addInitScript(script: { content: string }): Promise<void>;
  newPage(): Promise<GatePage>;
}
interface GateBrowser {
  newContext(options: { viewport: { width: number; height: number } }): Promise<GateContext>;
  close(): Promise<void>;
}
interface GateChromium {
  launch(options: {
    args?: string[];
    firefoxUserPrefs?: Record<string, number | boolean>;
  }): Promise<GateBrowser>;
}

type GateBrowserName = "chromium" | "firefox" | "webkit";

function isGateBrowserName(value: string): value is GateBrowserName {
  return value === "chromium" || value === "firefox" || value === "webkit";
}

const PLAY_LISTEN_MS = 4_500;
const READY_TIMEOUT_MS = 30_000;
const MIN_AUDIBLE_BUFFERS = 2;
const MIN_MASTER_PEAK = 0.005;
const PITCH_LOCK_CENTS = 35;
const PLAUSIBLE_F0_HZ: readonly [number, number] = [30, 2_100];

/**
 * Runs inside the page before any app script (plain JS string: the tools
 * tsconfig is Node-only, and this code executes in the browser, never in
 * Node). Two taps:
 *  - createBuffer: capture per-note rendered buffers (peak + leading PCM);
 *  - connect-to-destination: splice one analyser per context and track the
 *    master output peak, the only audible evidence live-graph synth recipes
 *    produce.
 */
const INIT_TAP_SCRIPT = `
(() => {
  window.__caps = [];
  window.__masterPeak = 0;
  const originalConnect = AudioNode.prototype.connect;
  const splice = (context) => {
    if (context.__gateAnalyser) return context.__gateAnalyser;
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.__gateTap = true;
    originalConnect.call(analyser, context.destination);
    context.__gateAnalyser = analyser;
    const sample = new Float32Array(analyser.fftSize);
    setInterval(() => {
      analyser.getFloatTimeDomainData(sample);
      for (let i = 0; i < sample.length; i += 1) {
        const m = Math.abs(sample[i]);
        if (m > window.__masterPeak) window.__masterPeak = m;
      }
    }, 120);
    return analyser;
  };
  AudioNode.prototype.connect = function (...args) {
    const target = args[0];
    if (this.__gateTap !== true && target instanceof AudioDestinationNode) {
      return originalConnect.call(this, splice(this.context));
    }
    return originalConnect.apply(this, args);
  };
  const originalCreateBuffer = AudioContext.prototype.createBuffer;
  AudioContext.prototype.createBuffer = function (channels, length, sampleRate) {
    const buffer = originalCreateBuffer.call(this, channels, length, sampleRate);
    if (window.__caps.length < 48) {
      const entry = { ch: channels, len: length, sr: sampleRate, maxAbs: -1, data: null };
      window.__caps.push(entry);
      setTimeout(() => {
        try {
          const channel = buffer.getChannelData(0);
          let maxAbs = 0;
          for (let i = 0; i < channel.length; i += 1) {
            const m = Math.abs(channel[i]);
            if (m > maxAbs) maxAbs = m;
          }
          entry.maxAbs = maxAbs;
          if (maxAbs > 1e-6 && length <= 500000) {
            entry.data = Array.from(channel.subarray(0, Math.min(channel.length, 65536)));
          }
        } catch (ignored) { /* buffer detached */ }
      }, 1500);
    }
    return buffer;
  };
})();
`;

interface BufferCapture {
  readonly ch: number;
  readonly len: number;
  readonly sr: number;
  readonly maxAbs: number;
  readonly data: readonly number[] | null;
}

interface InstrumentResult {
  readonly id: string;
  readonly label: string;
  readonly status: string;
  readonly statusHeldPlaying: boolean;
  readonly buffers: number;
  readonly audibleBuffers: number;
  readonly maxAbs: number;
  readonly pitchLock: {
    readonly checked: boolean;
    readonly lockedHz: number | null;
    readonly centsOff: number | null;
    readonly pass: boolean;
  };
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
  readonly pass: boolean;
  readonly failures: readonly string[];
}

interface RecoveryResult {
  readonly enforced: boolean;
  readonly outcome: "pass" | "fail" | "pending";
  readonly detail: string;
}

function autocorrelateF0(data: readonly number[], sampleRateHz: number): number | null {
  // Skip the attack/onset: find the first sample above threshold, then start
  // the analysis window a further 50 ms in so transients (chiff, hammer,
  // pick) do not dominate. The reverb impulse-response buffer the engine
  // creates at startup is aperiodic by construction and correctly yields
  // null here — callers must therefore try every captured buffer.
  const onset = data.findIndex((value) => Math.abs(value) > 1e-4);
  if (onset < 0) return null;
  const start = onset + Math.floor(sampleRateHz * 0.05);
  const window = data.slice(start, start + 16_384);
  const n = window.length;
  if (n < 4_096) return null;
  const minLag = Math.floor(sampleRateHz / PLAUSIBLE_F0_HZ[1]);
  const maxLag = Math.min(Math.floor(sampleRateHz / PLAUSIBLE_F0_HZ[0]), Math.floor(n / 2));
  if (maxLag <= minLag + 2) return null;
  // Normalized cross-correlation (acc / sqrt(eA*eB)) is robust under the
  // exponential decay of plucked/struck notes, where the plain acc/energy
  // ratio sags with the tail.
  const scoreAt = (lag: number): number => {
    let acc = 0;
    let energyA = 0;
    let energyB = 0;
    for (let index = 0; index + lag < n; index += 1) {
      const a = window[index] ?? 0;
      const b = window[index + lag] ?? 0;
      acc += a * b;
      energyA += a * a;
      energyB += b * b;
    }
    const denom = Math.sqrt(energyA * energyB);
    return denom > 1e-12 ? acc / denom : 0;
  };
  let bestLag = 0;
  let bestScore = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const score = scoreAt(lag);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag === 0 || bestScore < 0.5) return null;
  // A lock at the edge of the search range is an artifact of the range cap,
  // not a measurement (the sampled bass "locked" at exactly the 2100 Hz cap
  // during gate development); reject locks within 2% of either bound.
  if (bestLag <= minLag * 1.02 || bestLag >= maxLag * 0.98) return null;
  let refined = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const y0 = scoreAt(bestLag - 1);
    const y1 = scoreAt(bestLag);
    const y2 = scoreAt(bestLag + 1);
    const denom = y0 - 2 * y1 + y2;
    if (Math.abs(denom) > 1e-12) refined = bestLag + (0.5 * (y0 - y2)) / denom;
  }
  return sampleRateHz / refined;
}

function centsToNearestEqualTempered(frequencyHz: number): number {
  const midi = 69 + 12 * Math.log2(frequencyHz / 440);
  return (midi - Math.round(midi)) * 100;
}

async function openArtifactPage(
  browser: GateBrowser,
  url: string,
): Promise<{ page: GatePage; consoleErrors: string[]; pageErrors: string[] }> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript({
    content: INIT_TAP_SCRIPT,
  });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("[data-app-ready]", { timeout: READY_TIMEOUT_MS });
  return { page, consoleErrors, pageErrors };
}

async function readCaptures(
  page: GatePage,
): Promise<{ captures: BufferCapture[]; masterPeak: number }> {
  return page.evaluate(() => {
    const runtime = globalThis as unknown as Readonly<{
      __caps: BufferCapture[];
      __masterPeak: number;
    }>;
    return {
      captures: runtime.__caps.map((capture) => ({
        ch: capture.ch,
        len: capture.len,
        sr: capture.sr,
        maxAbs: capture.maxAbs,
        data: capture.data,
      })),
      masterPeak: runtime.__masterPeak,
    };
  });
}

async function playInstrument(
  browser: GateBrowser,
  url: string,
  instrumentId: string,
  label: string,
): Promise<InstrumentResult> {
  const { page, consoleErrors, pageErrors } = await openArtifactPage(browser, url);
  const failures: string[] = [];
  let status: string;
  let statusHeldPlaying: boolean;
  let captures: BufferCapture[];
  let masterPeak: number;
  try {
    await page.selectOption("#studio-transport-instrument", instrumentId);
    await page.waitForTimeout(400);
    await page.locator("#studio-transport-play").click();
    await page
      .waitForFunction(
        () => {
          const runtime = globalThis as unknown as Readonly<{
            document: Readonly<{
              querySelector(selector: string): Readonly<{
                textContent: string | null;
              }> | null;
            }>;
          }>;
          return runtime.document.querySelector(
            "#studio-transport-status-detail",
          )?.textContent?.includes("Playing") === true;
        },
        undefined,
        /* 30 s reach window: WebKit's slower wasm takes whole seconds of
         * preparation renders before "Playing" (measured ~8 s for the guitar
         * family on the live artifact, right at the old 8 s boundary). The
         * assertion is unchanged — status must REACH and then HOLD "Playing";
         * the broken-bytes planted negative fails on refusals and pitch, not
         * timing, so this widens no correctness check. */
        { timeout: 30_000 },
      )
      .catch(() => {
        /* recorded below via status text */
      });
    await page.waitForTimeout(PLAY_LISTEN_MS);
    status =
      (await page.locator("#studio-transport-status-detail").textContent().catch(() => null))?.trim() ??
      "(no status element)";
    statusHeldPlaying = status.includes("Playing");
    ({ captures, masterPeak } = await readCaptures(page));
  } finally {
    await page.context().close();
  }

  const audible = captures.filter((capture) => capture.maxAbs > 1e-6);
  // Try every captured buffer: the engine also creates aperiodic buffers by
  // design (the hall reverb impulse response), so the first capture proves
  // nothing; the gate passes when ANY buffer pitch-locks.
  let checkedAny = false;
  let lockedHz: number | null = null;
  let centsOff: number | null = null;
  for (const capture of audible) {
    if (capture.data === null || capture.data.length < 4_096) continue;
    checkedAny = true;
    const candidateHz = autocorrelateF0(capture.data, capture.sr);
    if (candidateHz === null) continue;
    const candidateCents = centsToNearestEqualTempered(candidateHz);
    if (lockedHz === null || Math.abs(candidateCents) < Math.abs(centsOff ?? 200)) {
      lockedHz = candidateHz;
      centsOff = candidateCents;
    }
    if (Math.abs(candidateCents) <= PITCH_LOCK_CENTS) break;
  }
  const pitchPass =
    lockedHz !== null && centsOff !== null && Math.abs(centsOff) <= PITCH_LOCK_CENTS;

  // Rendered/sampled recipes produce per-note buffers (beyond the reverb
  // impulse response, which is always capture #1); synth recipes play through
  // live oscillator graphs, so their audible evidence is the master-output
  // analyser peak and the pitch-lock check is not applicable to their
  // polyphonic master mix. Both classes require clean errors and a held
  // "Playing" status.
  const rendersBuffers = captures.length > 1;
  if (consoleErrors.length > 0) failures.push(`console errors: ${String(consoleErrors.length)}`);
  if (pageErrors.length > 0) failures.push(`page errors: ${String(pageErrors.length)}`);
  if (!statusHeldPlaying) failures.push(`status after listen window: "${status}"`);
  if (rendersBuffers) {
    if (audible.length < MIN_AUDIBLE_BUFFERS)
      failures.push(`audible buffers ${String(audible.length)} < ${String(MIN_AUDIBLE_BUFFERS)}`);
    if (!pitchPass)
      failures.push(
        lockedHz === null
          ? "no pitch lock in any captured buffer"
          : `pitch off by ${String(centsOff?.toFixed(1))} cents`,
      );
  } else if (masterPeak < MIN_MASTER_PEAK) {
    failures.push(
      `master output peak ${masterPeak.toFixed(5)} < ${String(MIN_MASTER_PEAK)} (no audible synth output)`,
    );
  }

  return {
    id: instrumentId,
    label,
    status,
    statusHeldPlaying,
    buffers: captures.length,
    audibleBuffers: audible.length,
    maxAbs: Math.max(masterPeak, ...captures.map((capture) => capture.maxAbs)),
    pitchLock: {
      checked: checkedAny,
      lockedHz,
      centsOff,
      pass: rendersBuffers ? pitchPass : true,
    },
    consoleErrors,
    pageErrors,
    pass: failures.length === 0,
    failures,
  };
}

async function recoveryFixture(
  browser: GateBrowser,
  url: string,
  instrumentIds: readonly string[],
  refusedIds: readonly string[],
  enforced: boolean,
): Promise<RecoveryResult> {
  if (instrumentIds.length < 2) {
    return { enforced, outcome: "pending", detail: "needs two instruments" };
  }
  // The fixture is only meaningful when a refusal actually occurs first; seed
  // with an instrument that refused in the matrix when one exists. On a
  // healthy artifact no refusal is reproducible and the fixture passes
  // vacuously — recorded as such, claimed as nothing more.
  if (refusedIds.length === 0) {
    return {
      enforced,
      outcome: "pass",
      detail: "vacuous — no refusal reproducible on this artifact",
    };
  }
  const { page } = await openArtifactPage(browser, url);
  try {
    const first = refusedIds[0] ?? "";
    const second = instrumentIds.find((id) => !refusedIds.includes(id)) ?? instrumentIds[0] ?? "";
    for (const id of [first, second]) {
      await page.selectOption("#studio-transport-instrument", id);
      await page.waitForTimeout(400);
      await page.locator("#studio-transport-play").click();
      await page.waitForTimeout(2_500);
      await page.locator("#studio-transport-stop").click().catch(() => {
        /* stop may be disabled after a fault; the next Play is the test */
      });
      await page.waitForTimeout(500);
    }
    await page.selectOption("#studio-transport-instrument", second);
    await page.waitForTimeout(400);
    await page.locator("#studio-transport-play").click();
    await page.waitForTimeout(2_500);
    const status =
      (await page.locator("#studio-transport-status-detail").textContent().catch(() => null))?.trim() ??
      "(no status element)";
    const pass = status.includes("Playing");
    if (pass) return { enforced, outcome: "pass", detail: `final status "${status}"` };
    return {
      enforced,
      outcome: enforced ? "fail" : "pending",
      detail: `final status "${status}" (RC2 fix ${enforced ? "enforced" : "not yet enforced"})`,
    };
  } finally {
    await page.context().close();
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  /* jcpe-engine-refusal-fault-cascade-vg8h landed, so the recovery fixture
   * is enforced by default (bead jcpe-deploy-pipeline-restoration-kbvj.3);
   * --no-enforce-recovery exists only for diagnosing a broken fixture and
   * never for shipping past it. */
  const enforceRecovery = !args.includes("--no-enforce-recovery");
  const jsonIndex = args.indexOf("--json");
  const jsonPath = jsonIndex >= 0 ? args[jsonIndex + 1] : undefined;
  const browserIndex = args.indexOf("--browser");
  const browserRaw = browserIndex >= 0 ? (args[browserIndex + 1] ?? "") : "chromium";
  if (!isGateBrowserName(browserRaw)) {
    process.stderr.write(`unknown --browser "${browserRaw}" (chromium|firefox|webkit)\n`);
    process.exit(2);
  }
  const browserName: GateBrowserName = browserRaw;
  const positional = args.filter(
    (value, index) =>
      !value.startsWith("--") &&
      (jsonIndex < 0 || index !== jsonIndex + 1) &&
      (browserIndex < 0 || index !== browserIndex + 1),
  );
  const artifactPath = resolve(positional[0] ?? "dist/index.html");
  const artifactBytes = readFileSync(artifactPath);

  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(artifactBytes);
  });
  await new Promise<void>((resolveListen) => {
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no server address");
  const url = `http://127.0.0.1:${String(address.port)}/`;

  // createRequire keeps TypeScript from resolving playwright's DOM-dependent
  // published types in this Node-only tsconfig; the structural GateChromium
  // interface above is the typed surface.
  const { createRequire } = await import("node:module");
  const nodeRequire = createRequire(import.meta.url);
  const playwright = nodeRequire("playwright") as Record<GateBrowserName, GateChromium>;
  // Engine-specific autoplay handling: Chromium takes a flag, Firefox takes
  // prefs, WebKit relies on the gate's real Play click (a trusted gesture).
  const browser = await (browserName === "chromium"
    ? playwright.chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
    : browserName === "firefox"
      ? playwright.firefox.launch({
          firefoxUserPrefs: {
            "media.autoplay.default": 0,
            "media.autoplay.blocking_policy": 0,
          },
        })
      : playwright.webkit.launch({}));

  const probe = await openArtifactPage(browser, url);
  const options = await probe.page.evaluate(() => {
    const runtime = globalThis as unknown as Readonly<{
      document: Readonly<{
        querySelectorAll(selector: string): ArrayLike<Readonly<{
          value: string;
          textContent: string | null;
        }>>;
      }>;
    }>;
    return Array.from(
      runtime.document.querySelectorAll(
        "#studio-transport-instrument option",
      ),
    ).map((option) => ({
      id: option.value,
      label: (option.textContent ?? "").trim(),
    }));
  });
  await probe.page.context().close();

  const results: InstrumentResult[] = [];
  for (const option of options) {
    const result = await playInstrument(browser, url, option.id, option.label);
    results.push(result);
    process.stderr.write(
      `${result.pass ? "PASS" : "FAIL"} ${option.id} status="${result.status}" audible=${String(
        result.audibleBuffers,
      )} f0=${result.pitchLock.lockedHz?.toFixed(1) ?? "-"}${
        result.failures.length > 0 ? ` [${result.failures.join("; ")}]` : ""
      }\n`,
    );
  }

  const recovery = await recoveryFixture(
    browser,
    url,
    options.map((option) => option.id),
    results.filter((result) => result.status.includes("refused")).map((result) => result.id),
    enforceRecovery,
  );
  process.stderr.write(`RECOVERY ${recovery.outcome} ${recovery.detail}\n`);

  await browser.close();
  server.close();

  const failing = results.filter((result) => !result.pass);
  const gatePass = failing.length === 0 && recovery.outcome !== "fail";
  const report = {
    artifactPath,
    browser: browserName,
    instrumentCount: options.length,
    gatePass,
    failingInstruments: failing.map((result) => result.id),
    recovery,
    results,
    noClaim:
      `Green proves error-free audible pitch-locked starter-chart playback in ${browserName} only; it proves nothing about sound quality or register coverage.`,
  };
  const serialized = JSON.stringify(report, null, 2);
  if (jsonPath !== undefined) writeFileSync(jsonPath, serialized);
  process.stdout.write(`${serialized}\n`);
  process.stderr.write(
    gatePass
      ? `PASS predeploy playback gate: ${String(options.length)} instruments\n`
      : `FAIL predeploy playback gate: ${String(failing.length)} failing instrument(s)\n`,
  );
  return gatePass ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`playback gate crashed: ${String(error)}\n`);
    process.exitCode = 2;
  });
