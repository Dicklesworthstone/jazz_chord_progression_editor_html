/*
 * Dark-trumpet evaluation harness (bead jcpe-wv1x).
 *
 * Renders the dark trumpet through a locally built dark-models wasm
 * (cargo build --release --target wasm32-unknown-unknown --features
 * dark-models, copied to the session scratchpad) and measures the
 * quality-gate laws (pitch/periodicity, onset, centroid trajectory,
 * brightness-vs-velocity, render ratio), then writes listening WAVs under
 * test-results/trumpet-dark/. TRUMPET_VARIANT=baseline|improved selects
 * the wasm so before/after A/B packs render from the same cells. Never
 * touches the shipping embed.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { estimatePitch } from "./reference-similarity";

const VARIANT = process.env["TRUMPET_VARIANT"] ?? "improved";
const WASM_PATH =
  VARIANT === "baseline"
    ? "/data/tmp/claude-1000/-data-projects-jazz-chord-progression-editor-html/fcc4066d-dfe7-403c-aa33-203a7de51bd3/scratchpad/baseline-trumpet.wasm"
    : "/data/tmp/claude-1000/-data-projects-jazz-chord-progression-editor-html/fcc4066d-dfe7-403c-aa33-203a7de51bd3/scratchpad/dark-trumpet.wasm";
const OUT_DIR = "test-results/trumpet-dark";
const RATE = 44_100;

const bytes = readFileSync(WASM_PATH);
const instance = await WebAssembly.instantiate(new WebAssembly.Module(bytes), {});
const exports = instance.exports as Record<string, unknown>;
const memory = exports["memory"] as WebAssembly.Memory;
/* No __heap_base in the raw cargo build: claim fresh pages past the current
 * end of memory as scratch — grown pages are untouched by static data. */
const heapBase = memory.buffer.byteLength;
memory.grow(64);
const noteFrames = exports["tpt_note_frames"] as (m: number, r: number) => number;
const render = exports["tpt_render"] as (
  m: number, v: number, r: number, l: number, rr: number, f: number,
) => number;

function renderNote(midi: number, velocity: number, seconds: number): Float32Array | null {
  const natural = noteFrames(midi, RATE);
  if (natural <= 0) return null;
  const frames = Math.min(natural, Math.round(seconds * RATE));
  const bytesNeeded = heapBase + frames * 8;
  if (bytesNeeded > memory.buffer.byteLength) {
    memory.grow(Math.ceil((bytesNeeded - memory.buffer.byteLength) / 65_536));
  }
  const left = heapBase;
  const right = heapBase + frames * 4;
  const started = performance.now();
  const written = render(midi, velocity, RATE, left, right, frames);
  const wall = (performance.now() - started) / 1_000;
  if (written <= 0) return null;
  const mono = new Float32Array(written);
  const l = new Float32Array(memory.buffer, left, written);
  const r = new Float32Array(memory.buffer, right, written);
  for (let i = 0; i < written; i += 1) mono[i] = ((l[i] ?? 0) + (r[i] ?? 0)) / 2;
  (renderNote as unknown as { lastRatio: number }).lastRatio = wall / (written / RATE);
  return mono;
}

function stats(m: Float32Array) {
  let peak = 0, sum = 0, finite = true;
  for (const v of m) {
    if (!Number.isFinite(v)) { finite = false; continue; }
    const a = Math.abs(v);
    if (a > peak) peak = a;
    sum += v * v;
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, m.length)), finite };
}

function onset(m: Float32Array): number | null {
  let peak = 0;
  for (const v of m) { const a = Math.abs(v); if (a > peak) peak = a; }
  if (peak <= 0) return null;
  const th = peak * 10 ** (-20 / 20);
  for (let i = 0; i < m.length; i += 1) if (Math.abs(m[i] ?? 0) >= th) return i / RATE;
  return null;
}

function goertzel(m: Float32Array, start: number, len: number, hz: number): number {
  const w = (2 * Math.PI * hz) / RATE, c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  const end = Math.min(m.length, start + len);
  for (let i = start; i < end; i += 1) { const s = (m[i] ?? 0) + c * s1 - s2; s2 = s1; s1 = s; }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / Math.max(1, end - start);
}

function centroidTrack(m: Float32Array): number[] {
  const out: number[] = [];
  for (let cur = Math.floor(0.1 * RATE); cur + 4_096 <= m.length; cur += 4_096) {
    let wsum = 0, tot = 0;
    for (let b = 1; b <= 32; b += 1) {
      const hz = (b * 8_000) / 32;
      const a = goertzel(m, cur, 4_096, hz);
      wsum += a * hz; tot += a;
    }
    if (tot > 0) out.push(wsum / tot);
  }
  return out;
}

function harmonicProfileDb(m: Float32Array, f0: number, n: number): number[] {
  const start = Math.floor(0.3 * RATE);
  const out: number[] = [];
  const h1 = goertzel(m, start, 16_384, f0);
  for (let h = 1; h <= n; h += 1) {
    if (f0 * h >= RATE / 2) break;
    const a = goertzel(m, start, 16_384, f0 * h);
    out.push(h1 > 0 && a > 0 ? 20 * Math.log10(a / h1) : -120);
  }
  return out;
}

function writeWav(name: string, mono: Float32Array): void {
  let peak = 0;
  for (const v of mono) { const a = Math.abs(v); if (a > peak) peak = a; }
  const gain = peak > 0 ? (10 ** (-3 / 20)) / peak : 1;
  const data = mono.length * 2;
  const buf = new Uint8Array(44 + data);
  const view = new DataView(buf.buffer);
  const ascii = (o: number, s: string) => { for (let i = 0; i < s.length; i += 1) buf[o + i] = s.charCodeAt(i); };
  ascii(0, "RIFF"); view.setUint32(4, 36 + data, true); ascii(8, "WAVE"); ascii(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true); view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, "data");
  view.setUint32(40, data, true);
  for (let i = 0; i < mono.length; i += 1) {
    view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, (mono[i] ?? 0) * gain)) * 32_767), true);
  }
  writeFileSync(`${OUT_DIR}/${name}`, buf);
}

mkdirSync(OUT_DIR, { recursive: true });
const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

for (const midi of [54, 60, 66, 70]) {
  for (const velocity of [36, 72, 108]) {
    const m = renderNote(midi, velocity, 2);
    if (m === null) { console.log(`midi ${String(midi)} v${String(velocity)}: REFUSED`); continue; }
    const st = stats(m);
    const p = estimatePitch({ samples: m, sampleRateHz: RATE }, midiHz(midi));
    const on = onset(m);
    const track = centroidTrack(m);
    const mean = track.reduce((a, b) => a + b, 0) / Math.max(1, track.length);
    const sd = Math.sqrt(track.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, track.length));
    const ratio = (renderNote as unknown as { lastRatio: number }).lastRatio;
    console.log(
      `midi ${String(midi)} v${String(velocity)}: rms ${(20 * Math.log10(st.rms)).toFixed(1)}dB finite=${String(st.finite)} ` +
      `pitch ${p === null ? "NOLOCK" : `${p.centsFromExpected.toFixed(1)}c/${p.periodicity.toFixed(3)}p`} ` +
      `onset ${on === null ? "n/a" : `${(on * 1_000).toFixed(0)}ms`} ` +
      `centroid ${mean.toFixed(0)}Hz stasis ${(sd / mean).toFixed(3)} render ${ratio.toFixed(2)}x`,
    );
  }
  const mf = renderNote(midi, 88, 2);
  if (mf !== null) {
    writeWav(`trumpet-midi${String(midi)}-v88.${VARIANT}.wav`, mf);
    console.log(`  harmonics(dB re h1) v88: ${harmonicProfileDb(mf, midiHz(midi), 10).map((d) => d.toFixed(0)).join(",")}`);
  }
}
/* Velocity brightness law: brass MUST brighten with dynamics. */
for (const midi of [60]) {
  const rows: string[] = [];
  for (const velocity of [36, 72, 108]) {
    const m = renderNote(midi, velocity, 2);
    if (m === null) continue;
    const track = centroidTrack(m);
    const mean = track.reduce((a, b) => a + b, 0) / Math.max(1, track.length);
    rows.push(`v${String(velocity)}:${mean.toFixed(0)}Hz`);
  }
  console.log(`brightness-vs-velocity midi ${String(midi)}: ${rows.join(" ")}`);
}

/* Short line for the ear: pp-mf-ff crescendo + a five-note phrase. */
{
  const spacing = 0.45, gate = 1.2;
  const line: Array<[number, number]> = [[60, 36], [60, 72], [60, 108], [62, 88], [64, 88], [65, 96], [67, 108]];
  const total = Math.ceil((0.1 + line.length * spacing + gate + 0.3) * RATE);
  const mix = new Float32Array(total);
  for (const [index, [midi, velocity]] of line.entries()) {
    const m = renderNote(midi, velocity, gate);
    if (m === null) continue;
    const startAt = Math.round((0.1 + index * spacing) * RATE);
    for (let i = 0; i < m.length && startAt + i < total; i += 1) mix[startAt + i] = (mix[startAt + i] ?? 0) + (m[i] ?? 0);
  }
  writeWav(`trumpet-phrase.${VARIANT}.wav`, mix);
  console.log(`wrote trumpet-phrase.${VARIANT}.wav`);
}
