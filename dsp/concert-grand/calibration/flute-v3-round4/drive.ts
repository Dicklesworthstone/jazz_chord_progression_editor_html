/**
 * Flute v3 round-4 NSGA-II campaign driver.
 *
 * Uses the repo's ported, tested MOO core (nonDominatedSort, crowdingDistance
 * from scripts/physical-foundry-fitting.ts) in a custom generational loop so
 * the campaign gets what the library's single-box synchronous nsga2() cannot
 * offer: per-dimension ranges via unit-cube normalization, a seeded initial
 * population anchored on the round-3 landed tables, batch-parallel oracle
 * evaluation across worker copies, and a dedupe cache.
 *
 * Deterministic: splitmix64 stream seeded from CLI; every evaluation logged
 * as JSON-lines for re-execution. Oracle = unmodified UIowa runner via
 * oracle.py (measurement only).
 */
import { nonDominatedSort, crowdingDistance } from "/data/projects/jazz_chord_progression_editor_html/scripts/physical-foundry-fitting.ts";

type Individual = Readonly<{ x: readonly number[]; f: readonly number[] }>;

const DIMS = 15;
const RANGES: ReadonlyArray<readonly [number, number]> = [
  [0.02, 0.6], [0.02, 0.6], [0.02, 0.6],          // bright pp/mf/ff
  [1500, 9000], [1500, 9000], [1500, 9000],       // corner pp/mf/ff
  [0.3, 2.5], [0.3, 2.5], [0.3, 2.5],             // half-width pp/mf/ff
  [2.6, 4.2], [3.0, 4.6],                          // growth mf/ff
  [2.6, 3.6], [2.4, 3.4], [2.4, 3.4], [2.8, 3.8], // pp caps m72/m76/m79/m82
];
// Round-3 landed tables (the seed anchor), mapped to unit space below.
const SEED_PHYSICAL = [0.12, 0.21, 0.3, 5500, 5500, 5500, 0.9, 0.9, 0.9, 3.9, 4.15, 3.1, 2.7, 2.8, 3.3];

const POP = 32;
const GENERATIONS = 40;
const ETA_C = 15;
const ETA_M = 20;
const P_MUT = 1 / DIMS;
const WORKERS = 8;
const seedArg = Number(process.argv[2] ?? 20260808);

let s0 = BigInt(seedArg) & 0xffffffffffffffffn;
function nextU64(): bigint {
  s0 = (s0 + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
  let z = s0;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
  return z ^ (z >> 31n);
}
function rnd(): number {
  return Number(nextU64() >> 11n) / 9007199254740992;
}

function toPhysical(u: readonly number[]): number[] {
  return u.map((v, i) => {
    const [lo, hi] = RANGES[i]!;
    return lo + (hi - lo) * Math.min(1, Math.max(0, v));
  });
}
function toUnit(p: readonly number[]): number[] {
  return p.map((v, i) => {
    const [lo, hi] = RANGES[i]!;
    return (v - lo) / (hi - lo);
  });
}
function keyOf(u: readonly number[]): string {
  return toPhysical(u).map((v) => v.toPrecision(4)).join(",");
}

const cache = new Map<string, readonly number[]>();
const logFile = Bun.file("/tmp/flt3-opt/campaign.jsonl").writer();
let evals = 0;

async function evaluateBatch(units: readonly (readonly number[])[], gen: number): Promise<(readonly number[])[]> {
  const results: (readonly number[])[] = new Array(units.length);
  const queue: number[] = [];
  for (let i = 0; i < units.length; i += 1) {
    const k = keyOf(units[i]!);
    const hit = cache.get(k);
    if (hit !== undefined) results[i] = hit;
    else queue.push(i);
  }
  let cursor = 0;
  async function worker(w: number): Promise<void> {
    while (cursor < queue.length) {
      const idx = queue[cursor]!;
      cursor += 1;
      const u = units[idx]!;
      const phys = toPhysical(u);
      const proc = Bun.spawn(
        ["python3", "/tmp/flt3-opt/oracle.py", `/tmp/flt3-w${w}`,
          ...phys.map((v) => String(v))],
        { stdout: "pipe", stderr: "pipe" },
      );
      const out = await new Response(proc.stdout).text();
      await proc.exited;
      let objectives: readonly number[] = [8, 99, 99];
      let cells: unknown = null;
      try {
        const d = JSON.parse(out.slice(out.indexOf("{")));
        if (Array.isArray(d.objectives)) {
          objectives = d.objectives as number[];
          cells = d.cells;
        }
      } catch {
        /* build/runner error keeps the penalty objectives */
      }
      evals += 1;
      logFile.write(JSON.stringify({ gen, worker: w, physical: phys, objectives, cells }) + "\n");
      cache.set(keyOf(u), objectives);
      results[idx] = objectives;
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, (_, w) => worker(w)));
  logFile.flush();
  return results;
}

function sbx(a: readonly number[], b: readonly number[]): [number[], number[]] {
  const c1 = [...a];
  const c2 = [...b];
  for (let i = 0; i < DIMS; i += 1) {
    if (rnd() <= 0.5) {
      const u = rnd();
      const beta = u <= 0.5
        ? Math.pow(2 * u, 1 / (ETA_C + 1))
        : Math.pow(1 / (2 * (1 - u)), 1 / (ETA_C + 1));
      const x1 = a[i]!;
      const x2 = b[i]!;
      c1[i] = Math.min(1, Math.max(0, 0.5 * ((1 + beta) * x1 + (1 - beta) * x2)));
      c2[i] = Math.min(1, Math.max(0, 0.5 * ((1 - beta) * x1 + (1 + beta) * x2)));
    }
  }
  return [c1, c2];
}
function mutate(x: number[]): number[] {
  for (let i = 0; i < DIMS; i += 1) {
    if (rnd() < P_MUT) {
      const u = rnd();
      const delta = u < 0.5
        ? Math.pow(2 * u, 1 / (ETA_M + 1)) - 1
        : 1 - Math.pow(2 * (1 - u), 1 / (ETA_M + 1));
      x[i] = Math.min(1, Math.max(0, x[i]! + delta));
    }
  }
  return x;
}

function crowdingForPopulation(pop: readonly Individual[], fronts: readonly number[]): number[] {
  const crowd = new Array<number>(pop.length).fill(0);
  const byFront = new Map<number, number[]>();
  fronts.forEach((f, i) => {
    const list = byFront.get(f) ?? [];
    list.push(i);
    byFront.set(f, list);
  });
  for (const indices of byFront.values()) {
    const front = indices.map((i) => pop[i]!);
    const d = crowdingDistance(front);
    indices.forEach((i, j) => { crowd[i] = d[j] ?? 0; });
  }
  return crowd;
}

async function main(): Promise<void> {
  // Seeded initial population: round-3 anchor, 7 jitters, rest random.
  const seedUnit = toUnit(SEED_PHYSICAL);
  const units: number[][] = [seedUnit.map((v) => Math.min(1, Math.max(0, v)))];
  for (let j = 0; j < 7; j += 1) {
    units.push(seedUnit.map((v) => Math.min(1, Math.max(0, v + (rnd() - 0.5) * 0.1))));
  }
  while (units.length < POP) {
    units.push(Array.from({ length: DIMS }, () => rnd()));
  }
  let objectives = await evaluateBatch(units, 0);
  let pop: Individual[] = units.map((x, i) => ({ x, f: objectives[i]! }));
  console.log(`gen 0 evaluated (${evals} oracle calls)`);

  for (let gen = 1; gen <= GENERATIONS; gen += 1) {
    const fronts = nonDominatedSort(pop);
    if (fronts === null) throw new Error("sort failed");
    const crowd = crowdingForPopulation(pop, fronts);
    const pick = (): Individual => {
      const a = Math.floor(rnd() * pop.length);
      const b = Math.floor(rnd() * pop.length);
      const fa = fronts[a] ?? 0;
      const fb = fronts[b] ?? 0;
      if (fa < fb || (fa === fb && (crowd[a] ?? 0) >= (crowd[b] ?? 0))) return pop[a]!;
      return pop[b]!;
    };
    const childUnits: number[][] = [];
    while (childUnits.length < POP) {
      const [c1, c2] = sbx(pick().x, pick().x);
      childUnits.push(mutate(c1));
      if (childUnits.length < POP) childUnits.push(mutate(c2));
    }
    const childF = await evaluateBatch(childUnits, gen);
    const merged: Individual[] = [
      ...pop,
      ...childUnits.map((x, i) => ({ x, f: childF[i]! })),
    ];
    const mergedFronts = nonDominatedSort(merged);
    if (mergedFronts === null) throw new Error("sort failed");
    const mergedCrowd = crowdingForPopulation(merged, mergedFronts);
    const order = merged.map((_, i) => i).sort((a, b) => {
      const fa = mergedFronts[a]!;
      const fb = mergedFronts[b]!;
      if (fa !== fb) return fa - fb;
      const ca = mergedCrowd[a]!;
      const cb = mergedCrowd[b]!;
      if (ca !== cb) return cb - ca;
      return a - b;
    });
    pop = order.slice(0, POP).map((i) => merged[i]!);
    const best = pop.reduce((acc, ind) =>
      (ind.f[0]! < acc.f[0]! || (ind.f[0] === acc.f[0] && ind.f[1]! < acc.f[1]!)) ? ind : acc);
    console.log(`gen ${gen}: best fail=${best.f[0]} total=${best.f[1]?.toFixed(3)} max=${best.f[2]?.toFixed(3)} (${evals} oracle calls, cache ${cache.size})`);
    if (best.f[0] === 0) {
      console.log("ZERO-FAIL CANDIDATE FOUND");
      console.log(JSON.stringify({ physical: toPhysical(best.x), f: best.f }));
    }
  }
  const fronts = nonDominatedSort(pop)!;
  const front0 = pop.filter((_, i) => fronts[i] === 0);
  console.log("FINAL FRONT:");
  for (const ind of front0) {
    console.log(JSON.stringify({ f: ind.f, physical: toPhysical(ind.x).map((v) => Number(v.toPrecision(5))) }));
  }
  logFile.end();
}

await main();
