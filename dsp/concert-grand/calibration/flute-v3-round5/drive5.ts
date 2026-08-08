/**
 * Flute v3 round-5 NSGA-II campaign — HONEST oracle (unmodified runner at the
 * 44.1 kHz policy rate through the real flt2 path). Deterministic per seed;
 * every evaluation JSON-logged. Objectives: [fails, excess, mono].
 */
import { nonDominatedSort, crowdingDistance } from "/data/projects/jazz_chord_progression_editor_html/scripts/physical-foundry-fitting.ts";
import { appendFileSync } from "node:fs";

const DIMS = 10;
const RANGES: ReadonlyArray<readonly [number, number]> = [
  [0.02, 0.45], [0.02, 0.30], [0.02, 0.30],
  [1500, 9000], [1500, 9000], [1500, 9000],
  [0.0004, 0.0040], [0.0002, 0.0030],
  [1.0, 8.0], [3000, 12000],
];
const SEED_PHYSICAL = [0.3825, 0.0885, 0.0971, 5500, 5500, 5500, 0.00252, 0.00105, 3.0, 7500];
const POP = 20;
const GENERATIONS = 16;
const ETA_C = 15, ETA_M = 20, P_MUT = 1 / DIMS;
const WORKERS = 8;
const LOG = "/tmp/flt3-round5-campaign.jsonl";
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

async function evaluateBatch(xs: number[][]): Promise<number[][]> {
  const results: number[][] = new Array(xs.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(WORKERS, xs.length) }, (_, w) => (async () => {
    while (true) {
      const i = next++;
      if (i >= xs.length) return;
      const k = key(xs[i]!);
      const hit = cache.get(k);
      if (hit) { results[i] = hit; continue; }
      const phys = toPhys(xs[i]!);
      const proc = Bun.spawn(["python3", "/tmp/flt3-oracle5.py", `/tmp/flt3-w${w + 1}`, ...phys.map(String)], { stdout: "pipe", stderr: "pipe" });
      const out = await new Response(proc.stdout).text();
      await proc.exited;
      let f = [99, 9999, 99];
      try {
        const d = JSON.parse(out.trim().split("\n").pop() ?? "{}");
        if (typeof d.fails === "number") f = [d.fails, d.excess, d.mono];
      } catch { /* penalty stands */ }
      cache.set(k, f);
      results[i] = f;
      appendFileSync(LOG, JSON.stringify({ x: phys, f }) + "\n");
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

const seedUnit = toUnit(SEED_PHYSICAL);
let genomes: number[][] = [seedUnit];
for (let i = 1; i < POP; i++) {
  genomes.push(i < POP / 2
    ? seedUnit.map((v) => Math.min(1, Math.max(0, v + (rnd() - 0.5) * 0.15)))
    : Array.from({ length: DIMS }, () => rnd()));
}
try {
  const prior = (await Bun.file(LOG).text()).trim().split("\n");
  for (const line of prior) {
    try { const d = JSON.parse(line); cache.set(key(toUnit(d.x)), d.f); } catch {}
  }
  console.log(`warm cache: ${cache.size}`);
} catch {}
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
  const best = pop.reduce((a, b) => (a.f[0]! < b.f[0]! || (a.f[0] === b.f[0] && a.f[1]! < b.f[1]!) ? a : b));
  console.log(`gen ${gen}: best fails=${best.f[0]} excess=${best.f[1]?.toFixed(1)} mono=${best.f[2]} | evals=${cache.size}`);
  if (best.f[0] === 0 && best.f[2] === 0) { console.log("ZERO-FAIL:", JSON.stringify(toPhys(best.x))); }
}
const final = pop.filter((i) => i.f[0] === 0 && i.f[2] === 0).sort((a, b) => a.f[1]! - b.f[1]!);
console.log("FRONT:", JSON.stringify(pop.map((i) => ({ f: i.f, x: toPhys(i.x).map((v) => +v.toFixed(4)) })), null, 1));
console.log(final.length > 0 ? `WINNER: ${JSON.stringify(toPhys(final[0]!.x))}` : "NO ZERO-FAIL CANDIDATE");
