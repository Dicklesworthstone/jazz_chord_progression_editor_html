/**
 * V2 evidence gate.
 *
 * Independently verifies the V2 bounded progression voicing optimizer from
 * a clean invocation and emits a hash-bound machine-readable ledger under
 * test-results/v2-evidence/. The gate:
 *
 * 1. snapshots the complete V2 input closure (production, contract, doc,
 *    fixtures, validator, kits, tests) before and after every run and
 *    rejects drift;
 * 2. re-runs the spec validator and the exact V2 test suite as child
 *    processes, requiring zero failures and zero skips;
 * 3. runs seeded metamorphic conformance in-process: deterministic
 *    pseudo-random small charts are optimized by the production stepper
 *    and checked, case by case, against this script's own exhaustive
 *    brute-force fold (written fresh here, importing no validator code),
 *    plus byte-identical replay and quantum-budget schedule invariance;
 * 4. records the 64-event four-voice real-V1 performance observation
 *    (observation only — it gates nothing and cannot alter output).
 *
 * Wall time and resource numbers are measurements, never semantic inputs.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { cpus, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PROGRESSION_COST_AXES,
  PROGRESSION_COST_AGGREGATIONS,
  PROGRESSION_WORK_COUNTER_NAMES,
  advanceProgressionOptimization,
  assignVoiceTransition,
  initializeProgressionOptimization,
  initializeVoiceFrame,
  type ProgressionEvent,
  type ProgressionOptimizationOutcome,
  type ProgressionOptimizationRequest,
  type ProgressionSearchState,
  type VoiceAssignmentOperations,
} from "../src/theory";
import {
  buildFrame,
  buildStubOperations,
  documentIdOf,
  eventIdOf,
  type FixtureCase,
} from "../tests/support/progression-optimizer-test-kit";
import { buildRealChartRequest } from "../tests/support/progression-optimizer-real-oracle";
import {
  PROGRESSION_COST_POLICY_ID,
  PROGRESSION_COST_POLICY_VERSION,
  PROGRESSION_EVENT_SCHEMA,
  PROGRESSION_OPTIMIZER_ENGINE_ID,
  PROGRESSION_OPTIMIZER_ENGINE_VERSION,
  PROGRESSION_OPTIMIZER_REQUEST_SCHEMA,
  PROGRESSION_SEARCH_POLICY_ID,
  PROGRESSION_SEARCH_POLICY_VERSION,
  PROGRESSION_TIE_BREAK_POLICY_ID,
  PROGRESSION_TIE_BREAK_POLICY_VERSION,
} from "../src/theory/progression-optimizer-contract";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER_DIR = resolve(ROOT, "test-results/v2-evidence");
const LEDGER_PATH = resolve(LEDGER_DIR, "v2-evidence-ledger.json");

const INPUT_CLOSURE = Object.freeze([
  "docs/V2_PROGRESSION_OPTIMIZER_CONTRACT.md",
  "scripts/validate-v2-contract.ts",
  "src/theory/progression-optimizer-contract.ts",
  "src/theory/progression-optimizer.ts",
  "src/theory/voice-assignment-contract.ts",
  "tests/fixtures/progression-optimizer/boundary-cases.json",
  "tests/fixtures/progression-optimizer/limit-cases.json",
  "tests/fixtures/progression-optimizer/mutation-controls.json",
  "tests/fixtures/progression-optimizer/optimization-cases.json",
  "tests/fixtures/progression-optimizer/provenance-ledger.json",
  "tests/fixtures/progression-optimizer/stepper-cases.json",
  "tests/fixtures/progression-optimizer/trace-ledger.json",
  "tests/fixtures/progression-optimizer/v2-progression-optimizer-contract.json",
  "tests/integration/progression-optimizer-performance.test.ts",
  "tests/integration/progression-optimizer-v1-oracle.test.ts",
  "tests/static/v2-contract.test.ts",
  "tests/support/progression-optimizer-real-oracle.ts",
  "tests/support/progression-optimizer-test-kit.ts",
  "tests/unit/progression-optimizer-boundaries.test.ts",
  "tests/unit/progression-optimizer-constraints.test.ts",
  "tests/unit/progression-optimizer-counters.test.ts",
  "tests/unit/progression-optimizer-determinism.test.ts",
  "tests/unit/progression-optimizer-limits.test.ts",
  "tests/unit/progression-optimizer-oracle-equivalence.test.ts",
  "tests/unit/progression-optimizer-pareto.test.ts",
  "tests/unit/progression-optimizer-refusals.test.ts",
  "tests/unit/progression-optimizer-search.test.ts",
  "tests/unit/progression-optimizer-stepper.test.ts",
  "tests/unit/progression-optimizer-windows.test.ts",
] as const);

const TEST_FILES = INPUT_CLOSURE.filter((path) => path.endsWith(".test.ts"));

const METAMORPHIC_SEEDS = Object.freeze([
  0x5eed0001, 0x5eed0002, 0x5eed0003, 0x5eed0004, 0x5eed0005, 0x5eed0006,
  0x5eed0007, 0x5eed0008, 0x5eed0009, 0x5eed000a, 0x5eed000b, 0x5eed000c,
  0x5eed000d, 0x5eed000e, 0x5eed000f, 0x5eed0010, 0x5eed0011, 0x5eed0012,
  0x5eed0013, 0x5eed0014, 0x5eed0015, 0x5eed0016, 0x5eed0017, 0x5eed0018,
  0x5eed0019, 0x5eed001a, 0x5eed001b, 0x5eed001c, 0x5eed001d, 0x5eed001e,
  0x5eed001f, 0x5eed0020, 0x5eed0021, 0x5eed0022, 0x5eed0023, 0x5eed0024,
  0x5eed0025, 0x5eed0026, 0x5eed0027, 0x5eed0028,
] as const);

type Finding = Readonly<{ code: string; path: string; message: string }>;

class Findings {
  readonly list: Finding[] = [];
  add(code: string, path: string, message: string): void {
    this.list.push({ code, path, message });
  }
}

async function sha256File(path: string): Promise<{ bytes: number; sha256: string }> {
  const data = await readFile(resolve(ROOT, path));
  return {
    bytes: data.byteLength,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
}

type ClosureSnapshot = Readonly<{
  algorithm: "sha256-component-manifest-v1";
  digest: string;
  components: readonly Readonly<{ path: string; bytes: number; sha256: string }>[];
}>;

async function snapshotClosure(): Promise<ClosureSnapshot> {
  const components = [];
  for (const path of INPUT_CLOSURE) {
    const { bytes, sha256 } = await sha256File(path);
    components.push({ path, bytes, sha256 });
  }
  const digest = createHash("sha256")
    .update(components.map((c) => `${c.path}:${String(c.bytes)}:${c.sha256}`).join("\n"))
    .digest("hex");
  return { algorithm: "sha256-component-manifest-v1", digest, components };
}

type Execution = Readonly<{
  command: readonly string[];
  exitCode: number;
  elapsedMs: number;
  stdoutSha256: string;
  stderrSha256: string;
  stdoutTail: string;
}>;

async function runChild(command: readonly string[]): Promise<Execution> {
  const startedAt = performance.now();
  const child = Bun.spawn([...command], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return {
    command,
    exitCode,
    elapsedMs: performance.now() - startedAt,
    stdoutSha256: createHash("sha256").update(stdout).digest("hex"),
    stderrSha256: createHash("sha256").update(stderr).digest("hex"),
    stdoutTail: (stdout + stderr).split("\n").slice(-12).join("\n"),
  };
}

/* ------------------------------------------------------------------ */
/* Seeded metamorphic conformance                                     */
/* ------------------------------------------------------------------ */

/** Deterministic 32-bit LCG; no ambient randomness may enter evidence. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

type SeedCase = Readonly<{
  request: ProgressionOptimizationRequest;
  operations: VoiceAssignmentOperations;
  table: ReadonlyMap<string, readonly number[] | null>;
  loopTable: ReadonlyMap<string, readonly number[] | null>;
  eventCount: number;
  candidateCounts: readonly number[];
  loopClosure: boolean;
}>;

function candidateIdOf(index: number): string {
  return `candidate-${String(index).padStart(3, "0")}`;
}

function buildSeedCase(seed: number): SeedCase {
  const random = makeRandom(seed);
  const eventCount = 2 + Math.floor(random() * 3);
  const candidateCounts: number[] = [];
  for (let i = 0; i < eventCount; i += 1) {
    candidateCounts.push(1 + Math.floor(random() * 3));
  }
  const loopClosure = random() < 0.3;
  const events: ProgressionEvent[] = [];
  for (let i = 0; i < eventCount; i += 1) {
    const frames = [];
    const count = candidateCounts[i] ?? 1;
    for (let j = 0; j < count; j += 1) {
      frames.push(
        buildFrame(
          `event-${String(i).padStart(4, "0")}`,
          candidateIdOf(j),
          "balanced",
          [36 + i + j * 2, 50 + i + j, 60 + i + j],
        ),
      );
    }
    events.push({
      schema: PROGRESSION_EVENT_SCHEMA,
      kind: "auto" as const,
      eventId: eventIdOf(`event-${String(i).padStart(4, "0")}`),
      chainBoundary: i === 0 ? ("reset" as const) : ("continue" as const),
      candidates: frames,
      constraints: { families: null, range: null, bassRange: null, locks: [] },
    });
  }
  const table = new Map<string, readonly number[] | null>();
  for (let i = 0; i + 1 < eventCount; i += 1) {
    const fromCount = candidateCounts[i] ?? 1;
    const toCount = candidateCounts[i + 1] ?? 1;
    for (let a = 0; a < fromCount; a += 1) {
      for (let b = 0; b < toCount; b += 1) {
        const refused = random() < 0.12;
        table.set(
          `${String(i)}:${candidateIdOf(a)}->${candidateIdOf(b)}`,
          refused
            ? null
            : [
                Math.floor(random() * 10),
                Math.floor(random() * 6),
                Math.floor(random() * 3),
                Math.floor(random() * 2),
                Math.floor(random() * 2),
                Math.floor(random() * 2),
                8 + Math.floor(random() * 8),
              ],
        );
      }
    }
  }
  const loopTable = new Map<string, readonly number[] | null>();
  const lastCount = candidateCounts[eventCount - 1] ?? 1;
  const firstCount = candidateCounts[0] ?? 1;
  for (let a = 0; a < lastCount; a += 1) {
    for (let b = 0; b < firstCount; b += 1) {
      const refused = random() < 0.12;
      loopTable.set(
        `${candidateIdOf(a)}->${candidateIdOf(b)}`,
        refused
          ? null
          : [
              Math.floor(random() * 10),
              Math.floor(random() * 6),
              Math.floor(random() * 3),
              0,
              0,
              0,
              8 + Math.floor(random() * 8),
            ],
      );
    }
  }
  const fixtureShaped: FixtureCase = {
    file: "seeded",
    defaults: {},
    record: {
      id: `seed-${String(seed >>> 0)}`,
      request: {
        requestId: `v2-seed-${String(seed >>> 0)}`,
        transitions: [...table.entries()].map(([key, cost]) => {
          const [ordinal, pair] = key.split(":");
          const [from, to] = (pair ?? "").split("->");
          return cost === null
            ? {
                fromEventOrdinal: Number(ordinal),
                from,
                to,
                refusal: "no-assignment",
                lockConflictVoiceIds: [],
              }
            : { fromEventOrdinal: Number(ordinal), from, to, cost };
        }),
        loopTransitions: [...loopTable.entries()].map(([pair, cost]) => {
          const [from, to] = pair.split("->");
          return cost === null
            ? { from, to, refusal: "no-assignment", lockConflictVoiceIds: [] }
            : { from, to, cost };
        }),
      },
    },
  };
  const request: ProgressionOptimizationRequest = {
    schema: PROGRESSION_OPTIMIZER_REQUEST_SCHEMA,
    identity: {
      requestId: `v2-seed-${String(seed >>> 0)}`,
      documentId: documentIdOf("doc-v2-evidence"),
      sourceRevision: 1,
      engineId: PROGRESSION_OPTIMIZER_ENGINE_ID,
      engineVersion: PROGRESSION_OPTIMIZER_ENGINE_VERSION,
      costPolicyId: PROGRESSION_COST_POLICY_ID,
      costPolicyVersion: PROGRESSION_COST_POLICY_VERSION,
      searchPolicyId: PROGRESSION_SEARCH_POLICY_ID,
      searchPolicyVersion: PROGRESSION_SEARCH_POLICY_VERSION,
      tieBreakPolicyId: PROGRESSION_TIE_BREAK_POLICY_ID,
      tieBreakPolicyVersion: PROGRESSION_TIE_BREAK_POLICY_VERSION,
    },
    loopClosure,
    maxWorkQuanta: 8192,
    events,
  };
  return {
    request,
    operations: buildStubOperations(fixtureShaped),
    table,
    loopTable,
    eventCount,
    candidateCounts,
    loopClosure,
  };
}

function runProduction(
  request: ProgressionOptimizationRequest,
  operations: VoiceAssignmentOperations,
): ProgressionOptimizationOutcome {
  const initialized = initializeProgressionOptimization(request, operations);
  if (!initialized.ok) {
    throw new Error(`seed request refused: ${initialized.refusal.code}`);
  }
  let state: ProgressionSearchState = initialized.value;
  let guard = 0;
  while (state.status === "running") {
    guard += 1;
    if (guard > 10_000) throw new Error("seed run guard tripped");
    const advanced = advanceProgressionOptimization(state, operations);
    if (!advanced.ok) throw new Error(`seed advance refused: ${advanced.refusal.code}`);
    state = advanced.value;
  }
  if (!state.outcome) throw new Error("terminal without outcome");
  return state.outcome;
}

/**
 * Fresh exhaustive fold for the evidence gate: enumerate every chain,
 * apply loop closure, filter to the weak-Pareto front, and order by the
 * frozen comparator. Shares no code with the validator or production.
 */
function bruteFront(seedCase: SeedCase): Readonly<{
  front: readonly Readonly<{ path: readonly string[]; cost: readonly number[] }>[];
}> {
  const { table, loopTable, eventCount, candidateCounts, loopClosure } = seedCase;
  const fold = (base: readonly number[], next: readonly number[]): number[] =>
    PROGRESSION_COST_AXES.map((axis, i) =>
      PROGRESSION_COST_AGGREGATIONS[axis] === "sum"
        ? (base[i] ?? 0) + (next[i] ?? 0)
        : Math.max(base[i] ?? 0, next[i] ?? 0),
    );
  let chains: Readonly<{ path: readonly string[]; cost: readonly number[] }>[] = [];
  const firstCount = candidateCounts[0] ?? 1;
  for (let j = 0; j < firstCount; j += 1) {
    chains.push({
      path: [candidateIdOf(j)],
      cost: PROGRESSION_COST_AXES.map(() => 0),
    });
  }
  for (let i = 1; i < eventCount; i += 1) {
    const nextChains: typeof chains = [];
    const count = candidateCounts[i] ?? 1;
    for (const chain of chains) {
      for (let j = 0; j < count; j += 1) {
        const key = `${String(i - 1)}:${chain.path[chain.path.length - 1] ?? ""}->${candidateIdOf(j)}`;
        const cost = table.get(key);
        if (cost === null || cost === undefined) continue;
        nextChains.push({
          path: [...chain.path, candidateIdOf(j)],
          cost: fold(chain.cost, cost),
        });
      }
    }
    chains = nextChains;
  }
  if (loopClosure) {
    chains = chains.flatMap((chain) => {
      const key = `${chain.path[chain.path.length - 1] ?? ""}->${chain.path[0] ?? ""}`;
      const cost = loopTable.get(key);
      if (cost === null || cost === undefined) return [];
      return [{ path: chain.path, cost: fold(chain.cost, cost) }];
    });
  }
  const dominates = (a: readonly number[], b: readonly number[]): boolean => {
    let strict = false;
    for (let i = 0; i < a.length; i += 1) {
      if ((a[i] ?? 0) > (b[i] ?? 0)) return false;
      if ((a[i] ?? 0) < (b[i] ?? 0)) strict = true;
    }
    return strict;
  };
  const front = chains.filter(
    (chain) => !chains.some((other) => other !== chain && dominates(other.cost, chain.cost)),
  );
  front.sort((a, b) => {
    for (let i = 0; i < PROGRESSION_COST_AXES.length; i += 1) {
      const delta = (a.cost[i] ?? 0) - (b.cost[i] ?? 0);
      if (delta !== 0) return delta;
    }
    const left = a.path.join(",");
    const right = b.path.join(",");
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return { front };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return value === undefined ? "null" : JSON.stringify(value);
}

type SeedResult = Readonly<{
  seed: number;
  eventCount: number;
  loopClosure: boolean;
  outcomeKind: string;
  outcomeSha256: string;
  frontSize: number;
}>;

function runSeededConformance(findings: Findings): readonly SeedResult[] {
  const results: SeedResult[] = [];
  for (const seed of METAMORPHIC_SEEDS) {
    const path = `seed:${String(seed >>> 0)}`;
    try {
      const seedCase = buildSeedCase(seed);
      const first = runProduction(seedCase.request, seedCase.operations);
      const replay = runProduction(seedCase.request, seedCase.operations);
      if (canonical(first) !== canonical(replay)) {
        findings.add("V2E_REPLAY", path, "replay produced a different outcome");
      }
      const budgetOne: ProgressionOptimizationRequest = {
        ...seedCase.request,
        maxWorkQuanta: 1,
      };
      const budgeted = runProduction(budgetOne, seedCase.operations);
      if (
        budgeted.kind !== "unfinished" &&
        canonical(budgeted) !== canonical(first)
      ) {
        findings.add(
          "V2E_SCHEDULE",
          path,
          "a finishing single-quantum run diverged from the unbounded run",
        );
      }
      const brute = bruteFront(seedCase);
      if (first.kind === "optimized") {
        const segment = first.segments[0];
        const produced = (segment?.realizations ?? []).map((realization) => ({
          path: [...realization.candidateIds],
          cost: PROGRESSION_COST_AXES.map((axis) => realization.cost[axis]),
        }));
        if (canonical(produced) !== canonical(brute.front)) {
          findings.add(
            "V2E_BRUTE",
            path,
            "production front differs from the exhaustive fold",
          );
        }
        const counters = first.stats.counters;
        if (
          counters.workUnits !==
          counters.seededStates +
            counters.statePairExpansions +
            counters.loopClosureUnits
        ) {
          findings.add("V2E_ACCOUNTING", path, "work-unit identity violated");
        }
      } else if (first.kind === "no-realization") {
        if (brute.front.length !== 0) {
          findings.add(
            "V2E_BRUTE",
            path,
            "production refused a chart the exhaustive fold can realize",
          );
        }
      } else {
        findings.add("V2E_OUTCOME", path, `unexpected outcome ${first.kind}`);
      }
      results.push({
        seed: seed >>> 0,
        eventCount: seedCase.eventCount,
        loopClosure: seedCase.loopClosure,
        outcomeKind: first.kind,
        outcomeSha256: createHash("sha256").update(canonical(first)).digest("hex"),
        frontSize:
          first.kind === "optimized"
            ? (first.segments[0]?.realizations.length ?? 0)
            : 0,
      });
    } catch (error) {
      findings.add("V2E_SEED", path, `seed run failed: ${String(error)}`);
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/* Entry                                                              */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const findings = new Findings();
  const before = await snapshotClosure();

  const validator = await runChild([process.execPath, "scripts/validate-v2-contract.ts"]);
  if (validator.exitCode !== 0) {
    findings.add("V2E_VALIDATOR", "validate-v2-contract", "spec validator failed");
  }

  const suite = await runChild([process.execPath, "test", ...TEST_FILES]);
  const summary = suite.stdoutTail;
  const passMatch = /(\d+) pass/u.exec(summary);
  const failMatch = /(\d+) fail/u.exec(summary);
  const skipMatch = /(\d+) skip/u.exec(summary);
  const passes = passMatch ? Number(passMatch[1]) : 0;
  const failures = failMatch ? Number(failMatch[1]) : -1;
  const skips = skipMatch ? Number(skipMatch[1]) : 0;
  if (suite.exitCode !== 0 || failures !== 0 || skips !== 0 || passes < 96) {
    findings.add(
      "V2E_SUITE",
      "bun test",
      `suite not clean: exit ${String(suite.exitCode)}, pass ${String(passes)}, fail ${String(failures)}, skip ${String(skips)}`,
    );
  }

  const seedResults = runSeededConformance(findings);

  const perfStartedAt = performance.now();
  const perfRequest = buildRealChartRequest(64, 12, "v2-evidence-perf", {
    voicesPerCandidate: 4,
  });
  const realOperations: VoiceAssignmentOperations = {
    initializeVoiceFrame,
    assignVoiceTransition,
  };
  let perfOutcomeKind = "error";
  try {
    const outcome = runProduction(perfRequest, realOperations);
    perfOutcomeKind = `${outcome.kind}/${outcome.termination}`;
  } catch (error) {
    findings.add("V2E_PERF", "performance-observation", String(error));
  }
  const perfElapsedMs = performance.now() - perfStartedAt;

  const after = await snapshotClosure();
  if (after.digest !== before.digest) {
    const changed = after.components.filter(
      (component, index) => before.components[index]?.sha256 !== component.sha256,
    );
    findings.add(
      "V2E_INPUT_DRIFT",
      "input-closure",
      `inputs changed during the run: ${changed.map((c) => c.path).join(", ")}`,
    );
  }

  const outcome = findings.list.length === 0 ? "pass" : "fail";
  const ledger = {
    schema: "changes.evidence.v2-progression-optimizer.v1",
    package: "V2",
    outcome,
    generatedAt: new Date().toISOString(),
    environment: {
      bunVersion: Bun.version,
      platform: platform(),
      osRelease: release(),
      cpuCount: cpus().length,
    },
    inputClosure: before,
    inputClosureAfter: { digest: after.digest },
    gates: {
      specValidator: {
        exitCode: validator.exitCode,
        elapsedMs: Math.round(validator.elapsedMs),
        stdoutSha256: validator.stdoutSha256,
      },
      testSuite: {
        exitCode: suite.exitCode,
        elapsedMs: Math.round(suite.elapsedMs),
        files: TEST_FILES.length,
        passes,
        failures,
        skips,
        stdoutSha256: suite.stdoutSha256,
        stderrSha256: suite.stderrSha256,
      },
    },
    seededConformance: {
      seeds: METAMORPHIC_SEEDS.length,
      generator: "lcg-1664525-1013904223-v1",
      counterNames: PROGRESSION_WORK_COUNTER_NAMES,
      results: seedResults,
    },
    performanceObservation: {
      gating: false,
      chart: "64-event, four-voice, 12 candidates per event, real V1 oracle",
      targetMs: 100,
      releaseCeilingMs: 500,
      observedMs: Math.round(perfElapsedMs * 10) / 10,
      outcome: perfOutcomeKind,
      note: "Observation only; enforcement belongs to the release-proof milestone on the CI reference runner. The floor is the real V1 per-call cost tracked by jcpe-72iu.",
    },
    findings: findings.list,
  };
  await mkdir(LEDGER_DIR, { recursive: true });
  const temporary = `${LEDGER_PATH}.tmp-${String(process.pid)}`;
  await writeFile(temporary, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  await rename(temporary, LEDGER_PATH);
  process.stdout.write(
    `${JSON.stringify(
      {
        schema: ledger.schema,
        outcome,
        suite: ledger.gates.testSuite,
        seeds: seedResults.length,
        performanceObservedMs: ledger.performanceObservation.observedMs,
        ledgerPath: "test-results/v2-evidence/v2-evidence-ledger.json",
        findings: findings.list,
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = outcome === "pass" ? 0 : 1;
}

if (import.meta.main) {
  await main();
}
