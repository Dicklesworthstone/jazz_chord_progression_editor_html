/**
 * Predeploy model-acceptance gate (bead jcpe-deploy-listening-gate-rw2n).
 *
 * Refuses to ship an artifact whose reachable DSP algorithm ids are not
 * covered by an accepting row in the model-acceptance ledger
 * (release-evidence/audio/listening/model-acceptance-ledger.json).
 *
 * "Reachable" deliberately exceeds the recipe registry: the 2026-08-06
 * regression shipped waveguide-clarinet@2 through an engine gesture-routing
 * override while the recipe still pointed at @1. The gate therefore unions:
 *   1. every recipe renderer algorithmId (imported, authoritative);
 *   2. the impulse algorithm id (always embedded);
 *   3. every `changes.dsp.<name>@<n>` literal in src/audio/dsp-renderer.ts
 *      whose exporting constant is referenced by src/audio/audio-engine.ts,
 *      plus any such literal appearing directly in audio-engine.ts.
 * Over-inclusion fails closed; that is the point.
 *
 * Shippable statuses: "approved", or "machine-delegated" with a checked-in,
 * semantic PASS evidence object bound to the exact shipping algorithm id.
 * File existence and prose are not evidence. "open"/"red"/missing/malformed,
 * a failed control, a stale hash, or a report for another model all fail.
 *
 * Exit codes: 0 = PASS, 1 = gate failure, 2 = usage/internal error.
 */
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  AUDIO_IMPULSE_ALGORITHM_ID,
  AUDIO_INSTRUMENT_RECIPES,
} from "../src/audio/instrument-recipes-contract";
import {
  CONCERT_GRAND_WASM_BASE64,
  CONCERT_GRAND_WASM_SHA256,
} from "../src/audio/wasm/concert-grand-wasm";
import {
  sha256Hex,
  verifyGateEvidence,
  type GateEvidenceV1,
} from "./reference-similarity";
import {
  verifyClarinetReferenceRunEvidence,
} from "./run-uiowa-clarinet-reference";
import {
  FLUTE_V2_REFERENCE_RUNNER_POLICY,
  runUiowaFluteV2Reference,
  verifyFluteV2ReferenceRunEvidenceAgainstReplay,
  type FluteV2ReferenceRunResult,
} from "./run-uiowa-flute-v2-reference";
import {
  verifyTrumpetReleaseEvidence,
} from "./run-trumpet-release-gate";
import {
  UPRIGHT_BASS_REPLACEMENT_POLICY,
  VIBES_REPLACEMENT_POLICY,
  runSampleReplacementGate,
  verifySampleReplacementEvidenceAgainstReplay,
  type SampleReplacementEvidence,
} from "./run-sample-replacement-gate";
import {
  verifyPluckedV2ReleaseEvidence,
} from "./run-plucked-v2-release-gate";

export const LEDGER_PATH =
  "release-evidence/audio/listening/model-acceptance-ledger.json";

const ALGORITHM_ID_PATTERN = /changes\.dsp\.[a-z0-9-]+@[0-9]+/g;
const LEDGER_STATUSES = ["approved", "open", "red", "machine-delegated"] as const;
const ROW_FIELDS = ["algorithmId", "status", "evidence", "decidedBy", "date"] as const;

type LedgerStatus = (typeof LEDGER_STATUSES)[number];

export type LedgerRow = Readonly<{
  algorithmId: string;
  status: LedgerStatus;
  evidence: string;
  decidedBy: string;
  date: string;
}>;

export type GateFinding = Readonly<{ code: string; detail: string }>;

export type GateReplayResults = Readonly<{
  fluteV2?: FluteV2ReferenceRunResult;
  sampleReplacement?: Readonly<{
    vibes?: SampleReplacementEvidence;
    uprightBass?: SampleReplacementEvidence;
  }>;
}>;

export function embeddedWasmDigestMatchesDeclaration(
  wasmBytes: Uint8Array,
): boolean {
  return sha256Hex(wasmBytes) === CONCERT_GRAND_WASM_SHA256;
}

export function collectRecipeAlgorithmIds(): readonly string[] {
  const ids = new Set<string>([AUDIO_IMPULSE_ALGORITHM_ID]);
  for (const recipe of AUDIO_INSTRUMENT_RECIPES) {
    if (recipe.synthesis === "rendered") ids.add(recipe.renderer.algorithmId);
  }
  return [...ids].sort();
}

/**
 * Source-scan for engine-reachable algorithm ids beyond the recipe registry.
 * Pure over its inputs so tests can inject synthetic sources.
 */
export function collectEngineRoutedAlgorithmIds(
  dspRendererSource: string,
  audioEngineSource: string,
): readonly string[] {
  const ids = new Set<string>();
  for (const match of audioEngineSource.matchAll(ALGORITHM_ID_PATTERN)) {
    ids.add(match[0]);
  }
  const constantPattern =
    /export const ([A-Z0-9_]+)\s*=\s*\n?\s*"(changes\.dsp\.[a-z0-9-]+@[0-9]+)"/g;
  for (const match of dspRendererSource.matchAll(constantPattern)) {
    const constantName = match[1];
    const algorithmId = match[2];
    if (
      constantName !== undefined &&
      algorithmId !== undefined &&
      audioEngineSource.includes(constantName)
    ) {
      ids.add(algorithmId);
    }
  }
  return [...ids].sort();
}

/**
 * Rule 4 (2026-08-09 review): a constant emitted as an `…AlgorithmId`
 * PROPERTY on a renderer object is a capability route — the engine can
 * invoke the model through the renderer surface without ever naming the
 * constant (the piano_v2 physical-attack capability ships exactly this
 * shape as `physicalAttackAlgorithmId`, invisible to rule 3). Pure scan;
 * the gate main decides shipping-ness by checking the embedded WASM
 * actually backs the route.
 */
export function collectCapabilityRoutedAlgorithmIds(
  dspRendererSource: string,
): readonly string[] {
  const ids = new Set<string>();
  const constantPattern =
    /export const ([A-Z0-9_]+)\s*=\s*\n?\s*"(changes\.dsp\.[a-z0-9-]+@[0-9]+)"/g;
  for (const match of dspRendererSource.matchAll(constantPattern)) {
    const constantName = match[1];
    const algorithmId = match[2];
    if (
      constantName !== undefined &&
      algorithmId !== undefined &&
      new RegExp(`[a-zA-Z]AlgorithmId:\\s*${constantName}\\b`).test(
        dspRendererSource,
      )
    ) {
      ids.add(algorithmId);
    }
  }
  return [...ids].sort();
}

/**
 * WASM exports that make each known capability route real. A routed id
 * with no row here fails closed (the map is maintenance-forced); a routed
 * id whose exports are absent from the shipping payload is dark and does
 * not require a ledger row — the moment the payload gains the exports,
 * the id joins the shipping set and demands acceptance evidence.
 */
export const CAPABILITY_ROUTE_REQUIRED_EXPORTS: Readonly<
  Record<string, readonly string[]>
> = Object.freeze({
  "changes.dsp.concert-grand@2": Object.freeze([
    "pno2_runtime_init",
    "pno2_runtime_step",
  ]),
});

export function parseLedger(value: unknown): readonly LedgerRow[] | GateFinding {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { code: "LEDGER_SHAPE", detail: "ledger root must be an object" };
  }
  const record = value as Record<string, unknown>;
  if (record["schemaVersion"] !== 1) {
    return { code: "LEDGER_SCHEMA_VERSION", detail: "schemaVersion must be 1" };
  }
  const rows = record["rows"];
  if (!Array.isArray(rows) || rows.length === 0) {
    return { code: "LEDGER_ROWS", detail: "rows must be a non-empty array" };
  }
  const parsed: LedgerRow[] = [];
  const seen = new Set<string>();
  for (const [index, rowValue] of rows.entries()) {
    if (typeof rowValue !== "object" || rowValue === null || Array.isArray(rowValue)) {
      return { code: "LEDGER_ROW_SHAPE", detail: `rows[${String(index)}] must be an object` };
    }
    const row = rowValue as Record<string, unknown>;
    for (const key of Object.keys(row)) {
      if (!(ROW_FIELDS as readonly string[]).includes(key)) {
        return {
          code: "LEDGER_UNKNOWN_FIELD",
          detail: `rows[${String(index)}] has unknown field "${key}"`,
        };
      }
    }
    for (const field of ROW_FIELDS) {
      if (typeof row[field] !== "string" || row[field] === "") {
        return {
          code: "LEDGER_FIELD",
          detail: `rows[${String(index)}].${field} must be a non-empty string`,
        };
      }
    }
    const status = row["status"] as string;
    if (!(LEDGER_STATUSES as readonly string[]).includes(status)) {
      return {
        code: "LEDGER_STATUS",
        detail: `rows[${String(index)}].status "${status}" is not a legal status`,
      };
    }
    const algorithmId = row["algorithmId"] as string;
    if (seen.has(algorithmId)) {
      return { code: "LEDGER_DUPLICATE", detail: `duplicate row for ${algorithmId}` };
    }
    seen.add(algorithmId);
    parsed.push({
      algorithmId,
      status: status as LedgerStatus,
      evidence: row["evidence"] as string,
      decidedBy: row["decidedBy"] as string,
      date: row["date"] as string,
    });
  }
  return parsed;
}

/**
 * Core gate decision, pure over injected inputs. Machine evidence must be one
 * repository-relative JSON path under the tracked release-evidence tree.
 * The injected loader keeps filesystem I/O out of this decision and lets
 * tests plant missing, malformed, stale, and cross-model reports.
 */
export function evaluateGate(
  shippingIds: readonly string[],
  rows: readonly LedgerRow[],
  loadEvidence: (path: string) => unknown,
  currentWasmSha256?: string,
  replays: GateReplayResults = {},
): readonly GateFinding[] {
  const findings: GateFinding[] = [];
  const byId = new Map(rows.map((row) => [row.algorithmId, row]));
  for (const id of shippingIds) {
    const row = byId.get(id);
    if (row === undefined) {
      findings.push({
        code: "MODEL_UNLISTED",
        detail: `${id} ships but has no ledger row (fails closed)`,
      });
      continue;
    }
    if (row.status === "approved") continue;
    if (row.status === "machine-delegated") {
      const evidencePath = row.evidence;
      if (!/^release-evidence\/audio\/listening\/[a-zA-Z0-9._/-]+\.json$/.test(evidencePath) ||
        evidencePath.includes("..")) {
        findings.push({
          code: "MODEL_DELEGATED_EVIDENCE_PATH",
          detail: `${id} is machine-delegated but evidence must be one checked-in repository-relative JSON path`,
        });
        continue;
      }
      const evidence = loadEvidence(evidencePath);
      if (evidence === undefined) {
        findings.push({
          code: "MODEL_DELEGATED_NO_EVIDENCE",
          detail: `${id} is machine-delegated but ${evidencePath} is absent or unreadable`,
        });
        continue;
      }
      let semanticPass: boolean;
      let evidencedAlgorithmIds: readonly string[] = [];
      let evidencedWasmSha256: string | null = null;
      try {
        if (id === FLUTE_V2_REFERENCE_RUNNER_POLICY.rendererAlgorithmId) {
          if (replays.fluteV2 === undefined) {
            findings.push({
              code: "MODEL_DELEGATED_REPLAY_REQUIRED",
              detail: `${id} is machine-delegated but no exact shipping-WASM replay was provided`,
            });
            continue;
          }
          if (replays.fluteV2.summary.outcome === "unavailable") {
            findings.push({
              code: "MODEL_DELEGATED_INVALID_EVIDENCE",
              detail: `${id} replay is unavailable: install the UIowa reference corpus under ` +
                `test-results/winds-reference-source/uiowa per docs/DEPLOY_GATE.md ` +
                `§ "Reference corpus prerequisite" (URLs and SHA-256 pins in ` +
                `tests/fixtures/uiowa-wind-identity-corpus.v1.json), then rerun`,
            });
            continue;
          }
          semanticPass = verifyFluteV2ReferenceRunEvidenceAgainstReplay(
            evidence,
            replays.fluteV2,
          );
          if (semanticPass) {
            const matrix = evidence as FluteV2ReferenceRunResult;
            evidencedAlgorithmIds = [matrix.policy.rendererAlgorithmId];
            evidencedWasmSha256 = matrix.wasmSha256;
          }
        } else if (id === VIBES_REPLACEMENT_POLICY.algorithmId ||
          id === UPRIGHT_BASS_REPLACEMENT_POLICY.algorithmId) {
          const replay = id === VIBES_REPLACEMENT_POLICY.algorithmId
            ? replays.sampleReplacement?.vibes
            : replays.sampleReplacement?.uprightBass;
          if (replay === undefined) {
            findings.push({
              code: "MODEL_DELEGATED_REPLAY_REQUIRED",
              detail: `${id} is machine-delegated but no exact shipping-WASM replay was provided`,
            });
            continue;
          }
          semanticPass = verifySampleReplacementEvidenceAgainstReplay(
            evidence,
            replay,
          );
          if (semanticPass) {
            const matrix = evidence as SampleReplacementEvidence;
            evidencedAlgorithmIds = matrix.algorithmIds;
            evidencedWasmSha256 = matrix.wasmSha256;
          }
        } else if (verifyClarinetReferenceRunEvidence(evidence)) {
          const matrix = evidence;
          semanticPass = true;
          evidencedAlgorithmIds = [matrix.policy.rendererAlgorithmId];
          evidencedWasmSha256 = matrix.wasmSha256;
        } else if (verifyPluckedV2ReleaseEvidence(evidence)) {
          const matrix = evidence;
          semanticPass = true;
          evidencedAlgorithmIds = matrix.algorithmIds;
          evidencedWasmSha256 = matrix.wasmSha256;
        } else if (verifyTrumpetReleaseEvidence(evidence)) {
          const matrix = evidence;
          semanticPass = true;
          evidencedAlgorithmIds = matrix.algorithmIds;
          evidencedWasmSha256 = matrix.wasmSha256;
        } else {
          const cell = evidence as GateEvidenceV1;
          semanticPass = verifyGateEvidence(cell);
          if (semanticPass) {
            evidencedAlgorithmIds = [cell.candidate.rendererAlgorithmId];
            evidencedWasmSha256 = cell.candidate.wasmSha256;
          }
        }
      } catch {
        semanticPass = false;
      }
      if (!semanticPass) {
        findings.push({
          code: "MODEL_DELEGATED_INVALID_EVIDENCE",
          detail: `${id} is machine-delegated but ${evidencePath} is not a semantic, hash-valid PASS report`,
        });
        continue;
      }
      if (!evidencedAlgorithmIds.includes(id)) {
        findings.push({
          code: "MODEL_DELEGATED_ALGORITHM_MISMATCH",
          detail: `${id} is machine-delegated but ${evidencePath} proves ${evidencedAlgorithmIds.join(", ") || "<none>"}`,
        });
      }
      if (currentWasmSha256 !== undefined && evidencedWasmSha256 !== currentWasmSha256) {
        findings.push({
          code: "MODEL_DELEGATED_WASM_MISMATCH",
          detail: `${id} is machine-delegated but ${evidencePath} proves WASM ${evidencedWasmSha256 ?? "<none>"}, not shipping ${currentWasmSha256}`,
        });
      }
      continue;
    }
    findings.push({
      code: row.status === "red" ? "MODEL_RED" : "MODEL_OPEN",
      detail: `${id} has listening status "${row.status}" and must not ship`,
    });
  }
  return findings;
}

async function main(): Promise<number> {
  const root = resolve(import.meta.dir, "..");
  const ledgerRaw = readFileSync(resolve(root, LEDGER_PATH), "utf8");
  let ledgerValue: unknown;
  try {
    ledgerValue = JSON.parse(ledgerRaw);
  } catch (error) {
    console.error(`FAIL LEDGER_JSON ${String(error)}`);
    return 1;
  }
  const rows = parseLedger(ledgerValue);
  if (!Array.isArray(rows)) {
    const finding = rows as GateFinding;
    console.error(`FAIL ${finding.code} ${finding.detail}`);
    return 1;
  }
  const ledgerRows = rows as readonly LedgerRow[];
  const dspRendererSource = readFileSync(
    resolve(root, "src/audio/dsp-renderer.ts"),
    "utf8",
  );
  const audioEngineSource = readFileSync(
    resolve(root, "src/audio/audio-engine.ts"),
    "utf8",
  );
  const wasmBytes = new Uint8Array(
    Buffer.from(CONCERT_GRAND_WASM_BASE64, "base64"),
  );
  if (!embeddedWasmDigestMatchesDeclaration(wasmBytes)) {
    console.error(
      "FAIL MODEL_WASM_DIGEST_DRIFT embedded Concert Grand bytes do not match their declared SHA-256",
    );
    return 1;
  }
  const wasmExportNames = new Set(
    WebAssembly.Module.exports(new WebAssembly.Module(wasmBytes)).map(
      (entry) => entry.name,
    ),
  );
  const capabilityRouted = collectCapabilityRoutedAlgorithmIds(dspRendererSource);
  const capabilityShipping: string[] = [];
  for (const id of capabilityRouted) {
    const required = CAPABILITY_ROUTE_REQUIRED_EXPORTS[id];
    if (required === undefined) {
      console.error(
        `FAIL MODEL_CAPABILITY_UNMAPPED ${id} is capability-routed in dsp-renderer but has no CAPABILITY_ROUTE_REQUIRED_EXPORTS row (fails closed)`,
      );
      process.exit(1);
    }
    if (required.every((name) => wasmExportNames.has(name))) {
      capabilityShipping.push(id);
    }
  }
  const shippingIds = [
    ...new Set([
      ...collectRecipeAlgorithmIds(),
      ...collectEngineRoutedAlgorithmIds(dspRendererSource, audioEngineSource),
      ...capabilityShipping,
    ]),
  ].sort();
  const needsFluteV2Replay = shippingIds.includes(
    FLUTE_V2_REFERENCE_RUNNER_POLICY.rendererAlgorithmId,
  ) && ledgerRows.some((row) =>
    row.algorithmId === FLUTE_V2_REFERENCE_RUNNER_POLICY.rendererAlgorithmId &&
    row.status === "machine-delegated",
  );
  const needsVibesReplay = shippingIds.includes(
    VIBES_REPLACEMENT_POLICY.algorithmId,
  ) && ledgerRows.some((row) =>
    row.algorithmId === VIBES_REPLACEMENT_POLICY.algorithmId &&
    row.status === "machine-delegated",
  );
  const needsUprightBassReplay = shippingIds.includes(
    UPRIGHT_BASS_REPLACEMENT_POLICY.algorithmId,
  ) && ledgerRows.some((row) =>
    row.algorithmId === UPRIGHT_BASS_REPLACEMENT_POLICY.algorithmId &&
    row.status === "machine-delegated",
  );
  const fluteV2 = needsFluteV2Replay
    ? await runUiowaFluteV2Reference({ root, wasmBytes })
    : undefined;
  const vibes = needsVibesReplay
    ? await runSampleReplacementGate("vibes", { root, wasmBytes })
    : undefined;
  const uprightBass = needsUprightBassReplay
    ? await runSampleReplacementGate("upright-bass", { root, wasmBytes })
    : undefined;
  const replays: GateReplayResults = {
    ...(fluteV2 === undefined ? {} : { fluteV2 }),
    ...(
      vibes === undefined && uprightBass === undefined
        ? {}
        : {
          sampleReplacement: {
            ...(vibes === undefined ? {} : { vibes }),
            ...(uprightBass === undefined ? {} : { uprightBass }),
          },
        }
    ),
  };
  const findings = evaluateGate(shippingIds, ledgerRows, (path) => {
    try {
      const value: unknown = JSON.parse(readFileSync(resolve(root, path), "utf8"));
      return value;
    } catch {
      return undefined;
    }
  }, sha256Hex(wasmBytes), replays);
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`FAIL ${finding.code} ${finding.detail}`);
    }
    console.error(
      `predeploy gate: ${String(findings.length)} blocking finding(s) across ${String(shippingIds.length)} shipping model(s). Do not deploy.`,
    );
    return 1;
  }
  console.log(
    `PASS predeploy model-acceptance gate: ${String(shippingIds.length)} shipping models covered (${shippingIds.join(", ")})`,
  );
  return 0;
}

if (import.meta.main) {
  process.exitCode = await main();
}
