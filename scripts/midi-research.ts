/**
 * Development-time MIDI research tool for growing the reviewed progression
 * library. NOT part of the shipped artifact: it runs under Bun, talks to the
 * network, and never enters the standalone runtime (which is offline by law).
 *
 * WHY THIS EXISTS. Finding a usable real MIDI for a copyrighted song costs a
 * lot of trial and error: every site gates its files differently, and most
 * free files are truncated demos, mislabelled karaoke, or corrupt
 * transcriptions. This script encodes, once, how each known site works and
 * then searches, downloads, parses, and SCORES candidates so the reviewer is
 * handed the best file with the rejects named and dismissed.
 *
 * SITE KNOWLEDGE (paid for in the 2026-08-05 research session):
 *
 *   bitmidi.com          Search page /search?q=<terms> lists song pages at
 *                        /<slug>; each song page links the real file at
 *                        /uploads/<id>.mid. Direct GET works with a browser
 *                        User-Agent and the song page as Referer. No
 *                        Cloudflare challenge. Best first stop.
 *   midisfree.com        WordPress Download Manager. The download page
 *                        contains an inline script with
 *                        location.href='<page-url>?wpdmdl=<id>&refresh=<tok>';
 *                        GET that URL to obtain the file. Cloudflare may
 *                        intervene; use --browser when it does.
 *   midishow.com         Real ensemble files, but downloads cost account
 *                        points (register, verify email, get 5 points).
 *                        The song page still publishes duration, size, and
 *                        instrumentation metadata, which this tool reports.
 *   midiworld.com        Legacy archive. Song pages embed
 *                        /old_midiworld/midiplay/playmidi.shtml?mid/<path>
 *                        whose player points at /cgibin/x.cgi/mid/<path>.mid;
 *                        most files are gone (404) as of 2026-08.
 *   musicimpressions.de  Demo MIDIs at /demos_midi/d_<ID>.mid, linked from
 *                        audiomidimania.com and karaokeisland.com song pages.
 *                        Demos are TRUNCATED previews (typically ~20 bars);
 *                        scoring says so.
 *   freemidis.net        Serves .rar bundles behind a Cloudflare challenge;
 *                        requires --browser, then unrar.
 *   onlinesequencer.net  User sequences; the MIDI export is generated
 *                        client-side from page state, so it needs a real
 *                        browser session. Quality varies wildly.
 *   supreme-network.com, songgalaxy.com, karaokeisland.com
 *                        Professional karaoke MIDIs behind a paywall; demo
 *                        links occasionally point at musicimpressions.de.
 *
 * USAGE
 *   bun scripts/midi-research.ts search <terms...>
 *       Query the adapters that support search; list candidates with direct
 *       file URLs where derivable.
 *   bun scripts/midi-research.ts fetch <url> [--name <file>]
 *       Download one candidate into the cache directory.
 *   bun scripts/midi-research.ts score <file...>
 *       Parse and score local SMF files; print a ranked table.
 *   bun scripts/midi-research.ts grab <terms...>
 *       search + fetch every derivable file + score + name the winner.
 *   Options: --out <dir> (default /tmp/jcpe-midi-research),
 *            --browser (use headless Chromium through playwright-core for
 *            Cloudflare-gated pages; requires no other Playwright suite to
 *            be running).
 *
 * Downloads stay OUTSIDE the repository by default. Nothing here is committed
 * with the tool; reference files are reviewer material, not source.
 */

import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

/*
 * playwright-core is loaded through createRequire + structural types: its
 * published .d.ts references DOM lib names (HTMLElement, SVGElement), and the
 * tools tsconfig deliberately ships without the DOM lib, so a static import
 * would fail `bun run typecheck` even though the runtime import is safe.
 */
type ResearchDownload = {
  suggestedFilename(): string;
  saveAs(path: string): Promise<void>;
};
type ResearchResponse = {
  url(): string;
  headers(): Record<string, string>;
  body(): Promise<Uint8Array>;
};
type ResearchHandle = {
  textContent(): Promise<string | null>;
  getAttribute(name: string): Promise<string | null>;
  click(options: { timeout: number }): Promise<void>;
};
type ResearchPage = {
  goto(url: string, options: { waitUntil: string; timeout: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  waitForEvent(event: "download", options: { timeout: number }): Promise<ResearchDownload>;
  $$(selector: string): Promise<ResearchHandle[]>;
  on(event: "response", handler: (response: ResearchResponse) => void): void;
  close(): Promise<void>;
};
type ResearchContext = {
  newPage(): Promise<ResearchPage>;
  close(): Promise<void>;
};
type ResearchBrowser = {
  newContext(options: { acceptDownloads: boolean; userAgent: string }): Promise<ResearchContext>;
  close(): Promise<void>;
};
type ResearchPlaywright = {
  chromium: {
    launch(options: { headless: boolean; args: readonly string[] }): Promise<ResearchBrowser>;
  };
};

function loadPlaywright(): ResearchPlaywright {
  const repoRequire = createRequire(new URL("../package.json", import.meta.url));
  return repoRequire("playwright-core") as ResearchPlaywright;
}

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const DEFAULT_OUT = "/tmp/jcpe-midi-research";

type Args = {
  command: string;
  positional: string[];
  out: string;
  name: string | null;
  browser: boolean;
};

function parseArgs(argv: readonly string[]): Args {
  const command = argv[0] ?? "help";
  const positional: string[] = [];
  let out = DEFAULT_OUT;
  let name: string | null = null;
  let browser = false;
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) break;
    if (arg === "--out") {
      out = argv[i + 1] ?? out;
      i += 1;
    } else if (arg === "--name") {
      name = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--browser") {
      browser = true;
    } else {
      positional.push(arg);
    }
  }
  return { command, positional, out, name, browser };
}

function sanitizeName(raw: string): string {
  const base = raw.replace(/\.[Mm][Ii][Dd][Ii]?$/u, "").replace(/\s+/gu, "-");
  return base.replace(/[^A-Za-z0-9._-]/gu, "").toLowerCase() || "candidate";
}

async function httpGetBytes(
  url: string,
  referer: string | null,
): Promise<Uint8Array | null> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "*/*",
  };
  if (referer !== null) headers["Referer"] = referer;
  try {
    const response = await fetch(url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      console.log(`  http ${String(response.status)} for ${url}`);
      return null;
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    console.log(`  fetch failed for ${url}: ${String(error)}`);
    return null;
  }
}

async function httpGetText(url: string, referer: string | null): Promise<string | null> {
  const bytes = await httpGetBytes(url, referer);
  return bytes === null ? null : new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function looksLikeSmf(bytes: Uint8Array): boolean {
  return (
    bytes.length > 14 &&
    bytes[0] === 0x4d &&
    bytes[1] === 0x54 &&
    bytes[2] === 0x68 &&
    bytes[3] === 0x64
  );
}

/* --------------------------------------------------------------- SMF parse */

type SmfNote = { ch: number; pitch: number; onTick: number; offTick: number };
type SmfTempo = { tick: number; usPerQuarter: number };
type SmfSig = { tick: number; num: number; den: number };
type SmfParse = {
  ppq: number;
  trackCount: number;
  trackNames: string[];
  notes: SmfNote[];
  tempos: SmfTempo[];
  sigs: SmfSig[];
};

function parseVarLen(bytes: Uint8Array, pos: number): [number, number] {
  let value = 0;
  let p = pos;
  for (;;) {
    const b = bytes[p];
    if (b === undefined) return [value, p];
    p += 1;
    value = (value << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) break;
  }
  return [value, p];
}

function parseSmf(bytes: Uint8Array): SmfParse | null {
  /* SMF meta strings are arbitrary bytes; latin-1 maps them 1:1 to code points
     so track names and headers survive decoding. WHATWG calls it by the
     windows-1252 superset; Bun's TextDecoder type only lists that label. */
  const td = new TextDecoder("windows-1252");
  let pos = 0;
  const readStr = (n: number): string => {
    const s = td.decode(bytes.subarray(pos, pos + n));
    pos += n;
    return s;
  };
  const readU32 = (): number => {
    const b0 = bytes[pos] ?? 0;
    const b1 = bytes[pos + 1] ?? 0;
    const b2 = bytes[pos + 2] ?? 0;
    const b3 = bytes[pos + 3] ?? 0;
    pos += 4;
    return ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
  };
  if (readStr(4) !== "MThd") return null;
  const headerLength = readU32();
  const trackCount = (bytes[pos + 2] ?? 0) * 256 + (bytes[pos + 3] ?? 0);
  const division = (bytes[pos + 4] ?? 0) * 256 + (bytes[pos + 5] ?? 0);
  pos += headerLength;
  if ((division & 0x8000) !== 0 || division === 0) return null;
  const notes: SmfNote[] = [];
  const tempos: SmfTempo[] = [];
  const sigs: SmfSig[] = [];
  const trackNames: string[] = [];
  for (let t = 0; t < trackCount; t += 1) {
    if (readStr(4) !== "MTrk") return null;
    const length = readU32();
    const end = pos + length;
    let tick = 0;
    let running = -1;
    let name = "";
    const active = new Map<number, SmfNote>();
    while (pos < end) {
      const [delta, nextPos] = parseVarLen(bytes, pos);
      pos = nextPos;
      tick += delta;
      let status = bytes[pos] ?? 0;
      if (status < 0x80) {
        status = running;
      } else {
        pos += 1;
        if (status < 0xf0) running = status;
      }
      if (status === 0xff) {
        const type = bytes[pos] ?? 0;
        pos += 1;
        const [metaLen, metaPos] = parseVarLen(bytes, pos);
        pos = metaPos;
        const data = bytes.subarray(pos, pos + metaLen);
        if (type === 0x03 && name === "") name = td.decode(data);
        if (type === 0x51 && metaLen === 3) {
          tempos.push({
            tick,
            usPerQuarter: ((data[0] ?? 0) << 16) | ((data[1] ?? 0) << 8) | (data[2] ?? 0),
          });
        }
        if (type === 0x58 && metaLen === 4) {
          sigs.push({ tick, num: data[0] ?? 4, den: 1 << (data[1] ?? 2) });
        }
        pos += metaLen;
      } else if (status === 0xf0 || status === 0xf7) {
        const [sysLen, sysPos] = parseVarLen(bytes, pos);
        pos = sysPos + sysLen;
      } else {
        const hi = status & 0xf0;
        const ch = status & 0x0f;
        if (hi === 0xc0 || hi === 0xd0) {
          pos += 1;
          continue;
        }
        const d1 = bytes[pos] ?? 0;
        const d2 = bytes[pos + 1] ?? 0;
        pos += 2;
        if (hi === 0x90 && d2 > 0) {
          const key = ch * 128 + d1;
          const previous = active.get(key);
          if (previous !== undefined) previous.offTick = tick;
          const note: SmfNote = { ch, pitch: d1, onTick: tick, offTick: tick };
          active.set(key, note);
          notes.push(note);
        } else if (hi === 0x80 || (hi === 0x90 && d2 === 0)) {
          const key = ch * 128 + d1;
          const previous = active.get(key);
          if (previous !== undefined) {
            previous.offTick = tick;
            active.delete(key);
          }
        }
      }
    }
    pos = end;
    if (name.trim().length > 0) trackNames.push(name.trim());
  }
  return { ppq: division, trackCount, trackNames, notes, tempos, sigs };
}

/* ---------------------------------------------------------------- scoring */

type SmfScore = {
  file: string;
  score: number;
  verdicts: string[];
  bpm: number | null;
  seconds: number;
  tracks: number;
  notes: number;
  channels: number;
  drums: boolean;
};

function scoreSmf(file: string, bytes: Uint8Array): SmfScore {
  const verdicts: string[] = [];
  if (!looksLikeSmf(bytes)) {
    return { file, score: -1000, verdicts: ["not an SMF file"], bpm: null, seconds: 0, tracks: 0, notes: 0, channels: 0, drums: false };
  }
  const parsed = parseSmf(bytes);
  if (parsed === null) {
    return { file, score: -1000, verdicts: ["SMF parse refused"], bpm: null, seconds: 0, tracks: 0, notes: 0, channels: 0, drums: false };
  }
  let score = 30;
  const firstTempo = [...parsed.tempos].sort((a, b) => a.tick - b.tick)[0];
  const bpm = firstTempo === undefined ? null : 60_000_000 / firstTempo.usPerQuarter;
  const toSec = (tick: number): number => {
    let sec = 0;
    let last = 0;
    let us = firstTempo?.usPerQuarter ?? 500_000;
    for (const t of [...parsed.tempos].sort((a, b) => a.tick - b.tick)) {
      if (t.tick >= tick) break;
      sec += ((t.tick - last) / parsed.ppq) * (us / 1_000_000);
      last = t.tick;
      us = t.usPerQuarter;
    }
    return sec + ((tick - last) / parsed.ppq) * (us / 1_000_000);
  };
  const noteEnds = parsed.notes.map((n) => Math.max(n.offTick, n.onTick + 1));
  const maxTick = noteEnds.length === 0 ? 0 : Math.max(...noteEnds);
  const seconds = toSec(maxTick);

  if (bpm === null) {
    verdicts.push("no tempo meta (timing unreliable)");
  } else if (bpm < 40 || bpm > 320) {
    score -= 25;
    verdicts.push(`tempo meta ${bpm.toFixed(0)} BPM outside sane range (corrupt or novelty)`);
  } else {
    score += 15;
    verdicts.push(`tempo ${bpm.toFixed(0)} BPM`);
  }
  if (seconds >= 150) {
    score += 15;
    verdicts.push(`full-length (${seconds.toFixed(0)} s)`);
  } else if (seconds >= 60) {
    score += 10;
    verdicts.push(`moderate length (${seconds.toFixed(0)} s)`);
  } else {
    score -= 15;
    verdicts.push(`TRUNCATED/demo length (${seconds.toFixed(0)} s)`);
  }
  if (parsed.trackCount >= 5) {
    score += 10;
    verdicts.push(`${String(parsed.trackCount)} tracks (ensemble)`);
  } else {
    verdicts.push(`${String(parsed.trackCount)} track(s)`);
  }
  const channels = new Set(parsed.notes.map((n) => n.ch));
  const drums = parsed.notes.some((n) => n.ch === 9);
  if (drums) {
    score += 8;
    verdicts.push("drum channel present");
  }
  const lowNotes = parsed.notes.filter((n) => n.pitch <= 52 && n.ch !== 9);
  if (lowNotes.length >= 20) {
    score += 10;
    verdicts.push("clear bass register");
  } else {
    verdicts.push("weak/no bass line");
  }
  const sig = parsed.sigs[0];
  const tpBar = parsed.ppq * 4 * ((sig?.num ?? 4) / (sig?.den ?? 4));
  if (maxTick > 0 && tpBar > 0) {
    const bars = Math.ceil(maxTick / tpBar);
    const pcs = new Set<number>();
    for (const n of parsed.notes) pcs.add(n.pitch % 12);
    const density = pcs.size / Math.max(1, bars);
    if (density >= 3) {
      score += 7;
      verdicts.push(`harmonic density ${density.toFixed(1)} pcs/bar`);
    }
  }
  return {
    file,
    score,
    verdicts,
    bpm,
    seconds,
    tracks: parsed.trackCount,
    notes: parsed.notes.length,
    channels: channels.size,
    drums,
  };
}

/* ---------------------------------------------------------------- adapters */

type Candidate = {
  site: string;
  title: string;
  fileUrl: string | null;
  pageUrl: string;
  note: string;
};

async function searchBitmidi(query: string): Promise<Candidate[]> {
  const url = `https://bitmidi.com/search?q=${encodeURIComponent(query)}`;
  const html = await httpGetText(url, null);
  if (html === null) return [];
  const out: Candidate[] = [];
  const re = /href="\/([a-z0-9-]+-mid)"/gu;
  const seen = new Set<string>();
  for (const m of html.matchAll(re)) {
    const slug = m[1];
    if (slug === undefined || seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      site: "bitmidi",
      title: slug.replace(/-mid$/u, "").replace(/-/gu, " "),
      fileUrl: null,
      pageUrl: `https://bitmidi.com/${slug}`,
      note: "fetch song page to reveal /uploads/<id>.mid",
    });
  }
  return out;
}

async function resolveBitmidi(candidate: Candidate): Promise<void> {
  const html = await httpGetText(candidate.pageUrl, null);
  if (html === null) return;
  const m = /href="(\/uploads\/\d+\.mid)"/u.exec(html);
  const path = m?.[1];
  if (path !== undefined) candidate.fileUrl = `https://bitmidi.com${path}`;
}

async function fetchMidisfreePage(pageUrl: string): Promise<string | null> {
  const html = await httpGetText(pageUrl, null);
  if (html === null) return null;
  const m = /location\.href='([^']*\?wpdmdl=\d+&refresh=[0-9a-f]+)'/u.exec(html);
  return m?.[1] ?? null;
}

async function reportMidishow(pageUrl: string): Promise<void> {
  const html = await httpGetText(pageUrl, null);
  if (html === null) return;
  const title = /<title>([^<]*)<\/title>/u.exec(html)?.[1] ?? pageUrl;
  const meta = /播放时长: ([0-9:]+), 文件大小: ([0-9.]+ [KM]B)/u.exec(html);
  console.log(`  midishow: ${title.trim()}`);
  if (meta !== null) {
    console.log(`    duration ${meta[1] ?? "?"}, size ${meta[2] ?? "?"} — download REQUIRES account points`);
  }
}

/*
 * Cloudflare-gated pages (freemidis.net, midisfree.net at times): a plain
 * fetch returns an HTML challenge. A real headless Chromium passes it.
 * SAFETY: never run this while another Playwright suite is executing
 * (`pgrep -af '@playwright|playwright'` first) — two suites thrash.
 */
async function browserDownload(pageUrl: string, dest: string): Promise<boolean> {
  let browser: ResearchBrowser | null = null;
  try {
    const { chromium } = loadPlaywright();
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const context = await browser.newContext({
      acceptDownloads: true,
      userAgent: USER_AGENT,
    });
    const page = await context.newPage();
    const captured: { bytes: Uint8Array | null } = { bytes: null };
    page.on("response", (response) => {
      const contentType = response.headers()["content-type"] ?? "";
      const url = response.url();
      if (contentType.includes("midi") || contentType.includes("octet-stream") || url.endsWith(".mid")) {
        void response
          .body()
          .then((body) => {
            if (looksLikeSmf(new Uint8Array(body))) captured.bytes = new Uint8Array(body);
          })
          .catch(() => undefined);
      }
    });
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForTimeout(6_000);
    const handles = await page.$$("a,button");
    for (const handle of handles) {
      const text = ((await handle.textContent().catch(() => "")) ?? "").trim().toLowerCase();
      const href = (await handle.getAttribute("href").catch(() => null)) ?? "";
      const onclick = (await handle.getAttribute("onclick").catch(() => null)) ?? "";
      if (!/download/iu.test(`${text} ${href} ${onclick}`)) continue;
      const pending = page.waitForEvent("download", { timeout: 40_000 }).catch(() => null);
      await handle.click({ timeout: 5_000 }).catch(() => undefined);
      const download = await pending;
      if (download !== null) {
        await download.saveAs(dest);
        const saved = readFileSync(dest);
        if (looksLikeSmf(saved)) {
          await context.close();
          return true;
        }
      }
      await page.waitForTimeout(1_500);
    }
    await page.waitForTimeout(4_000);
    await context.close();
    if (captured.bytes !== null) {
      writeFileSync(dest, captured.bytes);
      return true;
    }
    return false;
  } catch (error) {
    console.log(`  browser fallback failed for ${pageUrl}: ${String(error)}`);
    return false;
  } finally {
    if (browser !== null) await browser.close().catch(() => undefined);
  }
}

/* --------------------------------------------------------------- commands */

async function downloadCandidate(
  candidate: Candidate,
  outDir: string,
  nameOverride: string | null,
  useBrowser: boolean,
): Promise<string | null> {
  if (candidate.fileUrl === null) return null;
  const name = nameOverride ?? `${sanitizeName(candidate.title)}.mid`;
  const dest = join(outDir, name);
  const referer = candidate.site === "bitmidi" ? candidate.pageUrl : null;
  const bytes = await httpGetBytes(candidate.fileUrl, referer);
  if (bytes !== null && looksLikeSmf(bytes)) {
    writeFileSync(dest, bytes);
    return dest;
  }
  if (bytes !== null) {
    console.log(`  ${name}: downloaded ${String(bytes.length)} bytes but it is not SMF (HTML gate?)`);
  }
  if (useBrowser && (await browserDownload(candidate.pageUrl, dest))) {
    return dest;
  }
  return null;
}

async function cmdSearch(args: Args): Promise<void> {
  const query = args.positional.join(" ");
  console.log(`search: "${query}"`);
  const bitmidi = await searchBitmidi(query);
  for (const c of bitmidi) await resolveBitmidi(c);
  const all = [...bitmidi];
  if (all.length === 0) {
    console.log("  no adapter candidates. Manual fallbacks that worked before:");
    console.log("    midisfree.com download page (wpdmdl link), midishow.com (account),");
    console.log("    musicimpressions.de/demos_midi/d_<ID>.mid, freemidis.net (--browser).");
    return;
  }
  for (const c of all) {
    console.log(
      `  [${c.site}] ${c.title}\n    page: ${c.pageUrl}\n    file: ${c.fileUrl ?? c.note}`,
    );
  }
}

async function cmdFetch(args: Args): Promise<void> {
  const url = args.positional[0];
  if (url === undefined) {
    console.log("usage: fetch <url> [--name <file>] [--browser]");
    return;
  }
  mkdirSync(args.out, { recursive: true });
  if (url.includes("midishow.com")) {
    await reportMidishow(url);
    return;
  }
  let target = url;
  if (url.includes("midisfree.com")) {
    const wpdm = await fetchMidisfreePage(url);
    if (wpdm === null) {
      console.log("no wpdmdl link found; retry with --browser");
      if (!args.browser) return;
    } else {
      target = wpdm;
    }
  }
  const name = args.name ?? `${sanitizeName(basename(url))}.mid`;
  const dest = join(args.out, name.endsWith(".mid") ? name : `${name}.mid`);
  const bytes = await httpGetBytes(target, url);
  if (bytes !== null && looksLikeSmf(bytes)) {
    writeFileSync(dest, bytes);
    const scored = scoreSmf(dest, bytes);
    console.log(`saved ${dest} — score ${String(scored.score)}: ${scored.verdicts.join("; ")}`);
    return;
  }
  if (bytes !== null) {
    console.log(`direct fetch returned ${String(bytes.length)} non-SMF bytes (challenge page?)`);
  }
  if (!args.browser) {
    console.log("retry with --browser to pass the Cloudflare challenge in headless Chromium.");
    return;
  }
  if (await browserDownload(url, dest)) {
    const scored = scoreSmf(dest, readFileSync(dest));
    console.log(`saved ${dest} — score ${String(scored.score)}: ${scored.verdicts.join("; ")}`);
  } else {
    console.log("browser fallback did not produce an SMF file.");
  }
}

function cmdScore(args: Args): void {
  const rows: SmfScore[] = [];
  for (const file of args.positional) {
    const path = resolve(file);
    if (!existsSync(path)) {
      console.log(`missing: ${file}`);
      continue;
    }
    rows.push(scoreSmf(path, readFileSync(path)));
  }
  rows.sort((a, b) => b.score - a.score);
  for (const r of rows) {
    console.log(
      `${String(r.score).padStart(5, " ")}  ${r.file}\n        ${r.verdicts.join("; ")}\n        notes=${String(r.notes)} channels=${String(r.channels)} drums=${r.drums ? "yes" : "no"} tracks=${String(r.tracks)}`,
    );
  }
  const best = rows[0];
  if (best !== undefined && best.score > 0) {
    console.log(`BEST: ${best.file}`);
  }
}

async function cmdGrab(args: Args): Promise<void> {
  await cmdSearch(args);
  mkdirSync(args.out, { recursive: true });
  const query = args.positional.join(" ");
  const candidates = await searchBitmidi(query);
  for (const c of candidates) await resolveBitmidi(c);
  const files: string[] = [];
  for (const c of candidates) {
    const dest = await downloadCandidate(c, args.out, null, args.browser);
    if (dest !== null) files.push(dest);
  }
  if (files.length === 0) {
    console.log("nothing downloaded; use fetch <url> manually (see search notes).");
    return;
  }
  cmdScore({ ...args, positional: files });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  switch (args.command) {
    case "search":
      await cmdSearch(args);
      break;
    case "fetch":
      await cmdFetch(args);
      break;
    case "score":
      cmdScore(args);
      break;
    case "grab":
      await cmdGrab(args);
      break;
    default:
      console.log(
        "usage: bun scripts/midi-research.ts <search|fetch|score|grab> [args] [--out dir] [--name file] [--browser]",
      );
  }
}

void main();
