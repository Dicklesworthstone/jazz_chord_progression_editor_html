/**
 * Trumpet round-11 player x NL co-design campaign
 * (jcpe-trumpet-lock-completion-el46, recorded round-11 order).
 *
 * Oracle: the parameterized wall-test replica
 * tests/trumpet_codesign_eval.rs built in RELEASE mode and invoked directly
 * (verbatim ramp/metrics; acceptance stays with the unmodified wall test).
 *
 * Dims (physical): a1 lip Hz/kPa, a2 lip Hz/kPa^2, b1 valve /kPa,
 * b2 valve /kPa^2, c1 lip-damping zeta/kPa, nl nonlinear_coefficient.
 * Objectives (all minimized; 0 = the wall-test law passes):
 *   f0 pitch law      = 10*dip_hz + max(0, drift_cents - 20)
 *   f1 brightness law = max(0,1400-c_soft) + max(0,2600-c_loud) + centroid_dip
 *   f2 level law      = 1000*rms_dip_fraction + 100*max(0, peak_max - 0.98)
 *   f3 lock law       = 1e4 * max(0, 0.995 - min_periodicity)
 * Deterministic per seed; every evaluation JSON-logged for re-execution.
 */
import { nonDominatedSort, crowdingDistance } from "/data/projects/jazz_chord_progression_editor_html/scripts/physical-foundry-fitting.ts";
import { appendFileSync } from "node:fs";

const DIMS = 6;
const RANGES: ReadonlyArray<readonly [number, number]> = [
  [0.0, 10.0],      // a1 lip linear Hz/kPa (round-9 baseline 6.0)
  [-1.5, 1.5],      // a2 lip quadratic Hz/kPa^2
  [0.0, 0.06],      // b1 valve linear /kPa (baseline 0.020)
  [-0.008, 0.008],  // b2 valve quadratic /kPa^2
  [-0.02, 0.06],    // c1 lip damping zeta/kPa (baseline 0.0; + = firmer at forte)
  [1.8, 3.2],       // nl nonlinear_coefficient (canonical 2.3)
];
const BASELINE = [6.0, 0.0, 0.020, 0.0, 0.0, 2.3]; // round-9 schedule = the 24/25 state
const POP = 28;
const GENERATIONS = 22;
const ETA_C = 15, ETA_M = 20, P_MUT = 1 / DIMS;
const WORKERS = 8;
const BIN = "/data/tmp/cargo-target/release/deps/trumpet_codesign_eval-52a5cd984917d5af";
const LOG = "/tmp/trumpet-round11-campaign.jsonl";
const seedArg = Number(process.argv[2] ?? 20260809);

let s0 = BigInt(seedArg) & 0xffffffffffffffffn;
function nextU64(): bigint {
  s0 = (s0 + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
  let z = s0;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
  return z ^ (z >> 31n);
}
const rnd = () => Number(nextU64() >> 11n) / 9007199254740992;
const toPhys = (u: readonly number[]) => u.map((v, i) => RANGES[i]![0] + (RANGES[i]![1] - RANGES[i]![0]) * Math.min(1, Math.max(0, v)));
const toUnit = (p: readonly number[]) => p.map((v, i) => (v - RANGES[i]![0]) / (RANGES[i]![1] - RANGES[i]![0]));

type Ind = { x: number[]; f: number[] };
const cache = new Map<string, number[]>();
const key = (x: readonly number[]) => x.map((v) => v.toFixed(5)).join(",");

function objectives(d: Record<string, unknown>): number[] {
  if (d["ok"] !== true) return [999, 9999, 9999, 9999];
  const dip = d["dip_hz"] as number;
  const drift = d["drift_cents"] as number;
  const centroids = d["centroids"] as number[];
  const cdip = d["centroid_dip_hz"] as number;
  const rmsDip = d["rms_dip_fraction"] as number;
  const peaks = d["peaks"] as number[];
  const periodicities = d["periodicities"] as number[];
  const f0 = 10 * dip + Math.max(0, drift - 20);
  const f1 = Math.max(0, 1400 - centroids[0]!) + Math.max(0, 2600 - centroids[3]!) + cdip;
  const f2 = 1000 * rmsDip + 100 * Math.max(0, Math.max(...peaks) - 0.98);
  const f3 = 1e4 * Math.max(0, 0.995 - Math.min(...periodicities));
  return [f0, f1, f2, f3];
}

async function evaluateBatch(xs: number[][]): Promise<number[][]> {
  const results: number[][] = new Array(xs.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(WORKERS, xs.length) }, () => (async () => {
    while (true) {
      const i = next++;
      if (i >= xs.length) return;
      const k = key(xs[i]!);
      const hit = cache.get(k);
      if (hit) { results[i] = hit; continue; }
      const phys = toPhys(xs[i]!);
      const proc = Bun.spawn([BIN, "--ignored", "--nocapture"], {
        stdout: "pipe", stderr: "pipe",
        env: {
          ...process.env,
          CODESIGN_A1: String(phys[0]), CODESIGN_A2: String(phys[1]),
          CODESIGN_B1: String(phys[2]), CODESIGN_B2: String(phys[3]),
          CODESIGN_C1: String(phys[4]), CODESIGN_NL: String(phys[5]),
        },
      });
      const out = await new Response(proc.stdout).text();
      await proc.exited;
      let f = [999, 9999, 9999, 9999];
      let raw: Record<string, unknown> = {};
      try {
        const line = out.split("\n").find((l) => l.startsWith("{"));
        raw = JSON.parse(line ?? "{}");
        f = objectives(raw);
      } catch { /* penalty stands */ }
      cache.set(k, f);
      results[i] = f;
      appendFileSync(LOG, JSON.stringify({ x: phys, f, raw }) + "\n");
    }
  })());
  await Promise.all(lanes);
  return results;
}

function sbx(a: number[], b: number[]): [number[], number[]] {
  const c1 = a.slice(), c2 = b.slice();
  for (let i = 0; i < DIMS; i++) {
    if (rnd() <= 0.9 && Math.abs(a[i]! - b[i]!) > 1e-12) {
      const u = rnd();
      const beta = u <= 0.5 ? Math.pow(2 * u, 1 / (ETA_C + 1)) : Math.pow(1 / (2 * (1 - u)), 1 / (ETA_C + 1));
      c1[i] = 0.5 * ((1 + beta) * a[i]! + (1 - beta) * b[i]!);
      c2[i] = 0.5 * ((1 - beta) * a[i]! + (1 + beta) * b[i]!);
    }
  }
  return [c1, c2];
}
function mutate(x: number[]): number[] {
  const y = x.slice();
  for (let i = 0; i < DIMS; i++) {
    if (rnd() < P_MUT) {
      const u = rnd();
      const d = u < 0.5 ? Math.pow(2 * u, 1 / (ETA_M + 1)) - 1 : 1 - Math.pow(2 * (1 - u), 1 / (ETA_M + 1));
      y[i] = Math.min(1, Math.max(0, y[i]! + d));
    }
  }
  return y;
}
const dominates = (a: number[], b: number[]) => a.every((v, i) => v <= b[i]!) && a.some((v, i) => v < b[i]!);
function tournament(pop: Ind[]): Ind {
  const a = pop[Math.floor(rnd() * pop.length)]!, b = pop[Math.floor(rnd() * pop.length)]!;
  if (dominates(a.f, b.f)) return a;
  if (dominates(b.f, a.f)) return b;
  return rnd() < 0.5 ? a : b;
}

const seedUnit = toUnit(BASELINE);
// Round-10 measured anchors: valve-only monotone (48c drift), lip-heavy.
const anchors = [
  BASELINE,
  [0.0, 0.0, 0.045, 0.0, 0.0, 2.3],  // valve-only (round-10: monotone, drifty)
  [8.0, -0.5, 0.010, 0.001, 0.01, 2.3],
  [6.0, 0.0, 0.020, 0.0, 0.02, 2.6], // damping-scheduled, hotter NL
].map(toUnit);
let genomes: number[][] = [...anchors];
for (let i = genomes.length; i < POP; i++) {
  genomes.push(i < POP / 2
    ? seedUnit.map((v) => Math.min(1, Math.max(0, v + (rnd() - 0.5) * 0.2)))
    : Array.from({ length: DIMS }, () => rnd()));
}
try {
  const prior = (await Bun.file(LOG).text()).trim().split("\n").filter(Boolean);
  for (const line of prior) {
    try { const d = JSON.parse(line); cache.set(key(toUnit(d.x)), d.f); } catch { /* skip */ }
  }
  console.log(`warm cache: ${cache.size}`);
} catch { /* cold */ }
let pop: Ind[] = [];
{
  const fs = await evaluateBatch(genomes);
  pop = genomes.map((x, i) => ({ x, f: fs[i]! }));
}
for (let gen = 0; gen < GENERATIONS; gen++) {
  const kids: number[][] = [];
  while (kids.length < POP) {
    const [c1, c2] = sbx(tournament(pop).x, tournament(pop).x);
    kids.push(mutate(c1));
    if (kids.length < POP) kids.push(mutate(c2));
  }
  const kf = await evaluateBatch(kids);
  const union: Ind[] = [...pop, ...kids.map((x, i) => ({ x, f: kf[i]! }))];
  const levels = nonDominatedSort(union.map((i) => ({ f: i.f })));
  if (levels === null) throw new Error("sort refused (non-finite objective)");
  const byLevel = new Map<number, number[]>();
  levels.forEach((lv, idx) => { const a = byLevel.get(lv) ?? []; a.push(idx); byLevel.set(lv, a); });
  const nextPop: Ind[] = [];
  for (const lv of [...byLevel.keys()].sort((a, b) => a - b)) {
    const front = byLevel.get(lv)!;
    if (nextPop.length + front.length <= POP) {
      nextPop.push(...front.map((i) => union[i]!));
    } else {
      const cd = crowdingDistance(front.map((i) => ({ f: union[i]!.f })));
      const order = front.map((idx, j) => [idx, cd[j]!] as const).sort((x, y) => y[1] - x[1]);
      for (const [idx] of order) { if (nextPop.length < POP) nextPop.push(union[idx]!); }
    }
    if (nextPop.length >= POP) break;
  }
  pop = nextPop;
  const best = pop.reduce((m, i) => (i.f.reduce((s, v) => s + v, 0) < m.f.reduce((s, v) => s + v, 0) ? i : m));
  console.log(`gen ${gen}: best total=${best.f.reduce((s, v) => s + v, 0).toFixed(3)} f=${best.f.map((v) => v.toFixed(2)).join(",")} x=${toPhys(best.x).map((v) => v.toFixed(4)).join(",")}`);
  const feasible = pop.filter((i) => i.f.every((v) => v === 0));
  if (feasible.length > 0) {
    console.log(`FEASIBLE at gen ${gen}: ${feasible.length} candidate(s)`);
    for (const c of feasible.slice(0, 5)) console.log(`  x=${toPhys(c.x).map((v) => v.toFixed(5)).join(",")}`);
  }
}
console.log("final front:");
const finalLevels = nonDominatedSort(pop.map((i) => ({ f: i.f })));
pop.forEach((ind, i) => {
  if ((finalLevels?.[i] ?? 1) === 0) {
    console.log(`  f=${ind.f.map((v) => v.toFixed(3)).join(",")} x=${toPhys(ind.x).map((v) => v.toFixed(5)).join(",")}`);
  }
});
