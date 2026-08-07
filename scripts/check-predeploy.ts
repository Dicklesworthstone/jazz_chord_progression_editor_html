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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  AUDIO_IMPULSE_ALGORITHM_ID,
  AUDIO_INSTRUMENT_RECIPES,
} from "../src/audio/instrument-recipes-contract";
import {
  verifyGateEvidence,
  type GateEvidenceV1,
} from "./reference-similarity";

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
  loadEvidence: (path: string) => unknown | undefined,
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
      let semanticPass = false;
      try {
        semanticPass = verifyGateEvidence(evidence as GateEvidenceV1);
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
      const candidate = (evidence as GateEvidenceV1).candidate;
      if (candidate.rendererAlgorithmId !== id) {
        findings.push({
          code: "MODEL_DELEGATED_ALGORITHM_MISMATCH",
          detail: `${id} is machine-delegated but ${evidencePath} proves ${candidate.rendererAlgorithmId}`,
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

function main(): number {
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
  const dspRendererSource = readFileSync(
    resolve(root, "src/audio/dsp-renderer.ts"),
    "utf8",
  );
  const audioEngineSource = readFileSync(
    resolve(root, "src/audio/audio-engine.ts"),
    "utf8",
  );
  const shippingIds = [
    ...new Set([
      ...collectRecipeAlgorithmIds(),
      ...collectEngineRoutedAlgorithmIds(dspRendererSource, audioEngineSource),
    ]),
  ].sort();
  const findings = evaluateGate(shippingIds, rows, (path) => {
    try {
      const value: unknown = JSON.parse(readFileSync(resolve(root, path), "utf8"));
      return value;
    } catch {
      return undefined;
    }
  });
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
  process.exit(main());
}
