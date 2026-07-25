import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import {
  applicationHistoryRetainedByteEstimator,
  redoDocumentCommand,
  runAtomicEditPlan,
  undoDocumentCommand,
  type RunAtomicEditPlanRequest,
} from "../../src/application";
import {
  copyDomain,
  decodeDocumentShape,
  parseStableId,
  type IdFactoryResult,
  type StableIdFactory,
  type StableIdKind,
} from "../../src/domain";
import { validateDocumentSemantics } from "../../src/application";
import { parseChartText } from "../../src/theory";

/**
 * Production-versus-packet conformance: every accepted literal transition in
 * the reviewed A0/U1 packet is executed through the real `runAtomicEditPlan`
 * (or the live history ports for undo/redo rows) with evidence-scripted
 * stable-ID allocation and the real T0/F2/F3/history dependencies, and the
 * complete result must equal the literal expectation byte-for-byte. This is
 * an independent materializer; it deliberately imports nothing from the
 * packet validator.
 */

const REPO_ROOT = resolvePath(import.meta.dir, "../..");
const CASES_PATH = resolvePath(
  REPO_ROOT,
  "tests/fixtures/a0-u1-edit-plan/edit-plan-cases.json",
);

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const casesRoot: unknown = JSON.parse(readFileSync(CASES_PATH, "utf-8"));
if (!isRecord(casesRoot) || !isRecord(casesRoot["literalCatalog"])) {
  throw new Error("A0_U1_CONFORMANCE_CASES_SHAPE");
}
const catalog = casesRoot["literalCatalog"];

function catalogEntry(collection: string, id: string): unknown {
  const bucket = catalog[collection];
  if (!isRecord(bucket) || !(id in bucket)) {
    throw new Error(`A0_U1_CONFORMANCE_MISSING_LITERAL:${collection}/${id}`);
  }
  return bucket[id];
}

function pointerWalk(value: unknown, pointer: string): unknown {
  let cursor = value;
  for (const raw of pointer.split("/").filter((token) => token.length > 0)) {
    const token = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(cursor)) {
      cursor = cursor[Number(token)];
    } else if (isRecord(cursor)) {
      cursor = cursor[token];
    } else {
      throw new Error(`A0_U1_CONFORMANCE_POINTER:${pointer}`);
    }
  }
  return cursor;
}

function hydrateExternal(descriptor: JsonObject): unknown {
  const path = descriptor["path"];
  const expectedSha = descriptor["sha256"];
  const pointer = descriptor["jsonPointer"];
  if (
    typeof path !== "string" ||
    typeof expectedSha !== "string" ||
    typeof pointer !== "string"
  ) {
    throw new Error("A0_U1_CONFORMANCE_EXTERNAL_DESCRIPTOR");
  }
  const bytes = readFileSync(resolvePath(REPO_ROOT, path));
  if (sha256Hex(bytes) !== expectedSha) {
    throw new Error(`A0_U1_CONFORMANCE_EXTERNAL_DIGEST:${path}`);
  }
  return pointerWalk(JSON.parse(bytes.toString("utf-8")), pointer);
}

function materialize(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(materialize);
  }
  if (!isRecord(node)) return node;
  if (node["kind"] === "checked-in-independent-literal") {
    return materialize(hydrateExternal(node));
  }
  if ("$literalRef" in node) {
    const patches = node["patches"];
    if (!Array.isArray(patches) || patches.length !== 0) {
      throw new Error("A0_U1_CONFORMANCE_PATCHES_UNSUPPORTED");
    }
    const ref = node["$literalRef"];
    if (typeof ref !== "string") {
      throw new Error("A0_U1_CONFORMANCE_REF_SHAPE");
    }
    const [address, fragment] = ref.split("#");
    const parts = (address ?? "").split("/");
    if (parts.length !== 3 || parts[0] !== "literalCatalog") {
      throw new Error(`A0_U1_CONFORMANCE_REF:${ref}`);
    }
    const resolved = materialize(
      catalogEntry(parts[1] ?? "", parts[2] ?? ""),
    );
    return fragment === undefined
      ? resolved
      : materialize(pointerWalk(resolved, fragment));
  }
  return Object.fromEntries(
    Object.entries(node).map(([key, child]) => [key, materialize(child)]),
  );
}

type AllocationRow = Readonly<{
  kind: StableIdKind;
  allocatedId: string | null;
  outcome: string;
}>;

function scriptedFactory(
  rows: readonly AllocationRow[],
  hostile: boolean,
): Readonly<{ factory: StableIdFactory; calls: () => number }> {
  let index = 0;
  const factory: StableIdFactory = {
    next: <K extends StableIdKind>(kind: K) => {
      if (hostile) {
        throw new Error("A0_U1_CONFORMANCE_HOSTILE_FACTORY_CALLED");
      }
      const row = rows[index];
      index += 1;
      if (row === undefined) {
        throw new Error("A0_U1_CONFORMANCE_FACTORY_OVERRUN");
      }
      if (row.kind !== kind) {
        throw new Error(
          `A0_U1_CONFORMANCE_FACTORY_KIND:${row.kind}!=${kind}`,
        );
      }
      if (row.allocatedId === null) {
        return {
          ok: false as const,
          refusal: {
            code: "id.factory_exhausted" as const,
            kind,
            path: ["id"] as const,
          },
        };
      }
      const parsed = parseStableId(kind, row.allocatedId);
      if (parsed.ok) {
        return {
          ok: true as const,
          value: parsed.value,
          source: "deterministic-test" as const,
        };
      }
      /*
       * Evidence-scripted hostile wire (e.g. "!"): the factory returns the
       * raw value verbatim so production must catch it at the F2 boundary.
       */
      return {
        ok: true as const,
        value: row.allocatedId,
        source: "deterministic-test" as const,
      } as unknown as IdFactoryResult<K>;
    },
  };
  return { factory, calls: () => index };
}

const transitionsBucket = catalog["transitions"];
if (!isRecord(transitionsBucket)) {
  throw new Error("A0_U1_CONFORMANCE_TRANSITIONS_SHAPE");
}
const transitionIds = Object.keys(transitionsBucket).sort();

describe("A0/U1 production conformance against the accepted literal packet", () => {
  test("the packet exposes the complete reviewed transition inventory", () => {
    expect(transitionIds).toHaveLength(149);
  });

  for (const transitionId of transitionIds) {
    test(`${transitionId} matches production exactly`, () => {
      const row = materialize(transitionsBucket[transitionId]);
      if (!isRecord(row) || !isRecord(row["expected"])) {
        throw new Error("A0_U1_CONFORMANCE_ROW_SHAPE");
      }
      const expected = row["expected"];
      const expectedResult = expected["result"];
      const expectedAfter = expected["afterState"];
      const beforeState = deepFreeze(row["beforeState"]);
      const phase = row["phase"];

      if (phase === "undo" || phase === "redo") {
        expect(row["command"]).toBeNull();
        const port =
          phase === "undo" ? undoDocumentCommand : redoDocumentCommand;
        const result = port({
          state: beforeState as never,
        });
        expect(stableJson(result)).toBe(stableJson(expectedResult));
        expect(stableJson(result.state)).toBe(stableJson(expectedAfter));
        return;
      }

      expect(phase).toBe("apply");
      const trace = expected["allocationTrace"];
      const factoryEvidence = expected["idFactoryEvidence"];
      const hostile =
        isRecord(factoryEvidence) &&
        factoryEvidence["configuration"] === "hostile-refuse-on-any-call";
      const rows: AllocationRow[] = Array.isArray(trace)
        ? trace.map((entry) => {
            if (!isRecord(entry)) {
              throw new Error("A0_U1_CONFORMANCE_TRACE_ROW");
            }
            return {
              kind: entry["kind"] as StableIdKind,
              allocatedId:
                typeof entry["allocatedId"] === "string"
                  ? entry["allocatedId"]
                  : null,
              outcome: String(entry["outcome"]),
            };
          })
        : [];
      const { factory, calls } = scriptedFactory(rows, hostile);
      const estimatorEvidence = expected["historyEstimatorEvidence"];
      const hostileEstimator =
        isRecord(estimatorEvidence) &&
        typeof estimatorEvidence["configuration"] === "string" &&
        estimatorEvidence["configuration"].startsWith("hostile");
      let estimatorCalls = 0;
      const estimateHistoryRetainedBytes = (
        entry: Parameters<typeof applicationHistoryRetainedByteEstimator>[0],
      ): number => {
        estimatorCalls += 1;
        if (hostileEstimator && isRecord(estimatorEvidence)) {
          return Number(estimatorEvidence["returned"]);
        }
        return applicationHistoryRetainedByteEstimator(entry);
      };
      const command = deepFreeze(row["command"]);
      const request = {
        state: beforeState,
        command,
        dependencies: Object.freeze({
          copyDomain,
          decodeDocumentShape,
          validateDocumentSemantics,
          estimateHistoryRetainedBytes,
          parseChartText,
          stableIdFactory: factory,
        }),
      } as unknown as RunAtomicEditPlanRequest;

      const result = runAtomicEditPlan(request);
      expect(stableJson(result)).toBe(stableJson(expectedResult));
      expect(stableJson(result.state)).toBe(stableJson(expectedAfter));
      if (isRecord(factoryEvidence)) {
        expect(calls()).toBe(Number(factoryEvidence["callsObserved"]));
      }
      if (isRecord(estimatorEvidence)) {
        expect(estimatorCalls).toBe(
          Number(estimatorEvidence["callsObserved"]),
        );
      }
    });
  }
});
