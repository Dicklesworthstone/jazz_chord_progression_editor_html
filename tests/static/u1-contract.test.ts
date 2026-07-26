import { readFileSync, readdirSync, statSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";

import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  MAX_SELECTED_EVENT_IDS,
  TEXT_COMMAND_COALESCE_WINDOW_MS,
  APPLICATION_COMMAND_KINDS,
  type EphemeralIntent,
} from "../../src/application";
import { A0_U1_ATOMIC_EDIT_PLAN_KINDS } from "../../src/application/application-edit-plan-contract";
import {
  MAX_DOCUMENT_CHORD_EVENTS,
  MAX_DOCUMENT_SECTIONS,
  MAX_LONG_TEXT_CODE_POINTS,
  MAX_SECTION_MEASURES,
  MAX_SHORT_TEXT_CODE_POINTS,
} from "../../src/domain";
import { UI_LIMITS } from "../../src/ui/ui-contract";
import {
  U1_AUTHORIZED_COMMAND_KINDS,
  U1_AUTHORIZED_EDIT_PLAN_KINDS,
  U1_AUTHORIZED_EPHEMERAL_INTENT_KINDS,
  U1_COMPONENT_COUNT,
  U1_COMPONENT_INVENTORY,
  U1_EDITING_LIMITS,
  U1_EDITING_SURFACES,
  U1_EDIT_OPERATIONS,
  U1_EDIT_OPERATION_COUNT,
  U1_INSERTION_PLAN_KINDS,
  U1_KEYBOARD_ACCESS_KINDS,
  U1_LAW_IDS,
  U1_MEASURE_FILL_KINDS,
  U1_MUTATION_CHANNELS,
  U1_PUBLIC_BOUND_ASSIGNMENTS,
  U1_REFUSAL_CODES,
  U1_TOKEN_STATES,
  U1_UNAUTHORIZED_COMMAND_KINDS,
} from "../../src/ui/studio/u1-editing-contract";
import {
  U1_REVIEWED_AUTHORIZED_COMMAND_KINDS,
  U1_REVIEWED_BOUND_ASSIGNMENTS,
  U1_REVIEWED_COMPANIONS,
  U1_REVIEWED_COMPONENT_COUNT,
  U1_REVIEWED_EDIT_PLAN_KINDS,
  U1_REVIEWED_EPHEMERAL_INTENT_KINDS,
  U1_REVIEWED_INSERTION_PLAN_KINDS,
  U1_REVIEWED_KEYBOARD_ACCESS_KINDS,
  U1_REVIEWED_LAW_IDS,
  U1_REVIEWED_LIMITS,
  U1_REVIEWED_MEASURE_FILL_KINDS,
  U1_REVIEWED_MUTATION_CHANNELS,
  U1_REVIEWED_REFUSAL_CODES,
  U1_REVIEWED_SURFACES,
  U1_REVIEWED_TOKEN_STATES,
  U1_REVIEWED_UNAUTHORIZED_COMMAND_KINDS,
  validateU1Contract,
  type U1ContractValidationReport,
} from "../../scripts/validate-u1-contract";

setDefaultTimeout(120_000);

type JsonObject = Record<string, unknown>;
type Assert<Value extends true> = Value;

type AuthorizedIntentKind =
  (typeof U1_AUTHORIZED_EPHEMERAL_INTENT_KINDS)[number];
type LiveIntentKind = EphemeralIntent["kind"];

/** Every intent U1 may dispatch must exist in the live ephemeral union. */
const intentAssertions: readonly [
  Assert<AuthorizedIntentKind extends LiveIntentKind ? true : false>,
] = [true];

const fixtureRoot = new URL("../fixtures/editing", import.meta.url).pathname;
const REPO_ROOT = new URL("../..", import.meta.url).pathname;

function requireObject(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("U1_TEST_OBJECT_REQUIRED");
  }
  return value as JsonObject;
}

function requireArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("U1_TEST_ARRAY_REQUIRED");
  return value;
}

async function readJson(path: string): Promise<JsonObject> {
  return requireObject(JSON.parse(await readFile(path, "utf8")));
}

async function mutateJson(
  root: string,
  filename: string,
  mutate: (value: JsonObject) => void,
): Promise<void> {
  const path = join(root, filename);
  const value = await readJson(path);
  mutate(value);
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function withFixtureCopy(
  run: (root: string) => Promise<void>,
): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), "jcpe-u1-contract-"));
  const root = join(parent, "reviewed editing fixtures");
  try {
    await cp(fixtureRoot, root, { recursive: true });
    await run(root);
  } finally {
    await rm(parent, { force: true, recursive: true });
  }
}

function codes(report: U1ContractValidationReport): readonly string[] {
  return [...new Set(report.findings.map((item) => item.code))].sort();
}

async function expectRejected(
  root: string,
  ...expectedCodes: readonly string[]
): Promise<void> {
  const report = await validateU1Contract(root, { allowPendingFreeze: true });
  expect(report.outcome).toBe("fail");
  for (const code of expectedCodes) expect(codes(report)).toContain(code);
}

describe("U1 reviewed chart-editing contract", () => {
  test("accepts the reviewed packet deterministically", async () => {
    const first = await validateU1Contract(fixtureRoot);
    const second = await validateU1Contract(fixtureRoot);
    expect(second).toEqual(first);
    expect(first).toEqual({
      counts: {
        authorities: 9,
        companions: 6,
        components: 25,
        interactionCases: 58,
        mutationControls: 32,
        mutationControlsReplayed: 32,
        operationRows: 60,
        operations: 34,
        quickEntryCases: 46,
        traces: 8,
      },
      expertReviewClaim: false,
      findings: [],
      humanAcceptanceClaim: false,
      outcome: "pass",
      package: "U1",
      productionImplementationClaim: false,
      reviewState: "proposed-independent-spec",
      schema: "changes.validation.u1-contract.v1",
      uiCompletionClaim: false,
    });
  });

  test("freezes the source contract module against the reviewed packet", () => {
    expect([...intentAssertions]).toEqual([true]);
    expect(U1_EDITING_LIMITS).toEqual(U1_REVIEWED_LIMITS);
    expect(U1_PUBLIC_BOUND_ASSIGNMENTS).toEqual(U1_REVIEWED_BOUND_ASSIGNMENTS);
    expect(U1_REFUSAL_CODES).toEqual(U1_REVIEWED_REFUSAL_CODES);
    expect(U1_LAW_IDS).toEqual(U1_REVIEWED_LAW_IDS);
    expect(U1_EDITING_SURFACES).toEqual(U1_REVIEWED_SURFACES);
    expect(U1_MUTATION_CHANNELS).toEqual(U1_REVIEWED_MUTATION_CHANNELS);
    expect(U1_AUTHORIZED_COMMAND_KINDS).toEqual(
      U1_REVIEWED_AUTHORIZED_COMMAND_KINDS,
    );
    expect(U1_UNAUTHORIZED_COMMAND_KINDS).toEqual(
      U1_REVIEWED_UNAUTHORIZED_COMMAND_KINDS,
    );
    expect(U1_AUTHORIZED_EPHEMERAL_INTENT_KINDS).toEqual(
      U1_REVIEWED_EPHEMERAL_INTENT_KINDS,
    );
    expect(U1_AUTHORIZED_EDIT_PLAN_KINDS).toEqual(
      U1_REVIEWED_EDIT_PLAN_KINDS,
    );
    expect(U1_INSERTION_PLAN_KINDS).toEqual(U1_REVIEWED_INSERTION_PLAN_KINDS);
    expect(U1_MEASURE_FILL_KINDS).toEqual(U1_REVIEWED_MEASURE_FILL_KINDS);
    expect(U1_TOKEN_STATES).toEqual(U1_REVIEWED_TOKEN_STATES);
    expect(U1_KEYBOARD_ACCESS_KINDS).toEqual(
      U1_REVIEWED_KEYBOARD_ACCESS_KINDS,
    );
    expect(U1_COMPONENT_INVENTORY).toHaveLength(U1_REVIEWED_COMPONENT_COUNT);
    expect(U1_COMPONENT_COUNT).toBe(U1_REVIEWED_COMPONENT_COUNT);
    expect(U1_EDIT_OPERATIONS).toHaveLength(U1_EDIT_OPERATION_COUNT);
  });

  test("binds U1 to the live A0 command surface without widening it", () => {
    const live = [...APPLICATION_COMMAND_KINDS];
    expect(live).toHaveLength(16);
    const partition = [
      ...U1_AUTHORIZED_COMMAND_KINDS,
      ...U1_UNAUTHORIZED_COMMAND_KINDS,
    ].sort();
    expect(partition).toEqual([...live].sort());
    for (const kind of U1_AUTHORIZED_COMMAND_KINDS) {
      expect(live).toContain(kind);
    }
    for (const kind of U1_UNAUTHORIZED_COMMAND_KINDS) {
      expect(U1_AUTHORIZED_COMMAND_KINDS).not.toContain(kind);
    }
    expect([...U1_AUTHORIZED_EDIT_PLAN_KINDS]).toEqual([
      ...A0_U1_ATOMIC_EDIT_PLAN_KINDS,
    ]);
    for (const operation of U1_EDIT_OPERATIONS) {
      if (operation.commandKind !== null) {
        expect(live).toContain(operation.commandKind);
      }
      if (operation.planKind !== null) {
        expect(operation.commandKind).toBe("apply-edit-plan");
        expect([...A0_U1_ATOMIC_EDIT_PLAN_KINDS]).toContain(operation.planKind);
      }
      expect(operation.pointerAlternative).not.toBe("none");
    }
  });

  test("inherits upstream U0, A0, and domain bounds without restating them", () => {
    expect(U1_EDITING_LIMITS.pointerDragThresholdCssPx).toBe(
      UI_LIMITS.pointerDragThresholdCssPx,
    );
    expect(U1_EDITING_LIMITS.touchTargetCssPx).toBe(
      UI_LIMITS.projectTouchTargetCssPx,
    );
    expect(U1_EDITING_LIMITS.typeaheadResetMs).toBe(UI_LIMITS.typeaheadResetMs);
    expect(U1_EDITING_LIMITS.maxSelectedEventIds).toBe(MAX_SELECTED_EVENT_IDS);
    expect(U1_EDITING_LIMITS.textCommandCoalesceWindowMs).toBe(
      TEXT_COMMAND_COALESCE_WINDOW_MS,
    );
    expect(U1_EDITING_LIMITS.maxRenderedEvents).toBe(MAX_DOCUMENT_CHORD_EVENTS);
    expect(U1_EDITING_LIMITS.maxRenderedSections).toBe(MAX_DOCUMENT_SECTIONS);
    const renderedMeasures: number = U1_EDITING_LIMITS.maxRenderedMeasures;
    expect(renderedMeasures).toBe(MAX_DOCUMENT_SECTIONS * MAX_SECTION_MEASURES);
    expect(U1_EDITING_LIMITS.maxSectionNameCodePoints).toBe(
      MAX_SHORT_TEXT_CODE_POINTS,
    );
    expect(U1_EDITING_LIMITS.maxSectionAnnotationCodePoints).toBe(
      MAX_LONG_TEXT_CODE_POINTS,
    );
    expect(U1_EDITING_LIMITS.maxCompletionReasonCodePoints).toBe(
      MAX_LONG_TEXT_CODE_POINTS,
    );
    const draftBytes: number = U1_EDITING_LIMITS.maxDraftUtf8Bytes;
    const draftCodePoints: number = U1_EDITING_LIMITS.maxDraftCodePoints;
    expect(draftBytes).toBe(draftCodePoints * 4);
    expect(U1_EDITING_LIMITS.maxPreviewTokens * 2).toBe(draftCodePoints);
  });

  test("the fixture operation inventory equals the source inventory", async () => {
    const contract = await readJson(join(fixtureRoot, "u1-editing-contract.json"));
    expect(JSON.stringify(contract["operations"])).toBe(
      JSON.stringify(
        U1_EDIT_OPERATIONS.map(
          ({
            id,
            operation,
            surface,
            channel,
            commandKind,
            planKind,
            intentKind,
            undoable,
            pointerAlternative,
            keyboardAccess,
          }) => ({
            id,
            operation,
            surface,
            channel,
            commandKind,
            planKind,
            intentKind,
            undoable,
            pointerAlternative,
            keyboardAccess,
          }),
        ),
      ),
    );
    expect(contract["refusalCodes"]).toEqual([...U1_REFUSAL_CODES]);
    expect(contract["lawIds"]).toEqual([...U1_LAW_IDS]);
    expect(contract["limits"]).toEqual({ ...U1_EDITING_LIMITS });
    expect(contract["companions"]).toEqual([...U1_REVIEWED_COMPANIONS]);
  });

  /**
   * A refusal code no gesture can produce is not a guard, it is a name. The
   * inventory is a closed list of what U1 refuses before dispatch, so each
   * entry must appear somewhere in production besides the inventory that
   * declares it. jcpe-bdga removed four codes that failed this and fixed the
   * production gap behind a fifth.
   */
  test("every declared refusal code has a production site", () => {
    const DECLARATION = resolvePath(
      REPO_ROOT,
      "src/ui/studio/u1-editing-contract.ts",
    );
    const sites = new Map<string, string[]>(
      U1_REFUSAL_CODES.map((code) => [code, []]),
    );
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!path.endsWith(".ts") && !path.endsWith(".tsx")) continue;
        if (path === DECLARATION) continue;
        const source = readFileSync(path, "utf8");
        for (const code of U1_REFUSAL_CODES) {
          if (source.includes(`"${code}"`)) sites.get(code)?.push(path);
        }
      }
    };
    walk(resolvePath(REPO_ROOT, "src"));

    const orphaned = [...sites.entries()]
      .filter(([, found]) => found.length === 0)
      .map(([code]) => code);
    expect(orphaned, "refusal codes with no production site").toEqual([]);
  });

  /**
   * U1-INT-026 says an unmounted chart region leaves no listener behind. The
   * product has no path to that state: StudioShell renders ChartWorkspace as
   * an unconditional child of the workspace landmark for the lifetime of the
   * application. The row is a constraint on that composition, so the
   * constraint itself is what gets measured — "cannot happen" is otherwise
   * indistinguishable from "was never tried". The leak class the row guards is
   * covered behaviourally by U1-INT-020 and U1-INT-023.
   */
  test("U1-INT-026 the chart region is mounted unconditionally", () => {
    const shell = readFileSync(
      resolvePath(REPO_ROOT, "src/ui/studio/StudioShell.tsx"),
      "utf8",
    );
    const mounts = [...shell.matchAll(/<ChartWorkspace\b/gu)];
    expect(mounts, "ChartWorkspace is mounted exactly once").toHaveLength(1);

    // Nothing may gate the mount: no conditional operator, logical guard, or
    // null branch may share a line with it, and it must sit directly inside
    // the workspace landmark rather than in a nested expression.
    const lines = shell.split("\n");
    const at = lines.findIndex((line) => line.includes("<ChartWorkspace"));
    expect(at).toBeGreaterThan(-1);
    const mountLine = lines[at] ?? "";
    expect(mountLine).not.toContain("&&");
    expect(mountLine).not.toContain("?");
    expect(mountLine).not.toContain(":");

    const before = lines.slice(0, at).join("\n");
    const openWorkspace = before.lastIndexOf("<main");
    const closeWorkspace = before.lastIndexOf("</main>");
    expect(
      openWorkspace,
      "the mount sits inside the workspace landmark",
    ).toBeGreaterThan(closeWorkspace);
    // No conditional expression is open between the landmark and the mount.
    const between = before.slice(openWorkspace);
    expect(between).not.toContain("&&");
  });

  test("rejects missing, extra, malformed, and duplicate-key files", async () => {
    await withFixtureCopy(async (root) => {
      await rm(join(root, "trace-ledger.json"));
      await writeFile(join(root, "extra.json"), "{}\n", "utf8");
      await expectRejected(
        root,
        "U1_CONTRACT_FILE_SET",
        "U1_CONTRACT_FILE_MISSING",
      );
    });
    await withFixtureCopy(async (root) => {
      const path = join(root, "u1-editing-contract.json");
      const source = await readFile(path, "utf8");
      await writeFile(
        path,
        source.replace(
          '"schema": "changes.fixtures.u1-editing-contract.v1"',
          '"schema": "changes.fixtures.u1-editing-contract.v1", '
            + '"\\u0073chema": "changes.fixtures.u1-editing-contract.v1"',
        ),
        "utf8",
      );
      await expectRejected(root, "U1_CONTRACT_DUPLICATE_KEY");
    });
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "u1-editing-contract.json", (value) => {
        value["unknown"] = true;
        value["contractVersion"] = 2;
      });
      await expectRejected(root, "U1_CONTRACT_KEYS", "U1_CONTRACT_VERSION");
    });
  });

  test("rejects a widened or relabelled application channel", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "u1-editing-contract.json", (value) => {
        const operations = requireArray(value["operations"]);
        requireObject(operations[3])["commandKind"] = "replace-document";
        const authorized = requireArray(value["authorizedCommandKinds"]);
        authorized.push("set-voicing");
      });
      await expectRejected(
        root,
        "U1_CONTRACT_COMMAND_AUTHORIZATION",
        "U1_CONTRACT_CHANNEL_BINDING",
      );
    });
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "edit-operation-matrix.json", (value) => {
        const rows = requireArray(value["rows"]);
        requireObject(requireObject(rows[3])["expected"])["commandCount"] = 2;
        const policy = requireObject(value["dispatchPolicy"]);
        policy["batchedCommands"] = "allowed";
      });
      await expectRejected(root, "U1_CONTRACT_CHANNEL_BINDING");
    });
  });

  test("rejects a fabricated insertion plan and measure arithmetic", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "quick-entry-cases.json", (value) => {
        const cases = requireArray(value["cases"]);
        const first = requireObject(cases[1]);
        requireObject(first["expected"])["insertionPlan"] = "completes-measures";
        const second = requireObject(cases[0]);
        const meter = requireObject(second["meter"]);
        meter["beatsPerBar"] = 5;
      });
      await expectRejected(
        root,
        "U1_CONTRACT_INSERTION_PLAN",
        "U1_CONTRACT_MEASURE_ARITHMETIC",
      );
    });
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "quick-entry-cases.json", (value) => {
        const cases = requireArray(value["cases"]);
        const overfill = requireObject(cases[16]);
        const destination = requireObject(overfill["destination"]);
        destination["measureEventCount"] = 0;
        destination["measureCompletion"] = "empty";
        destination["measureFilled"] = { denominator: 1, numerator: 0 };
      });
      await expectRejected(root, "U1_CONTRACT_INSERTION_PLAN");
    });
  });

  test("rejects a relaxed pointer, listener, or identity policy", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "u1-editing-contract.json", (value) => {
        const pointer = requireObject(value["pointerPolicy"]);
        pointer["preventDefaultBeforeThreshold"] = true;
        const identity = requireObject(value["identityPolicy"]);
        identity["indexKeys"] = "allowed";
      });
      await expectRejected(
        root,
        "U1_CONTRACT_POINTER_POLICY",
        "U1_CONTRACT_IDENTITY",
      );
    });
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "interaction-state-matrix.json", (value) => {
        const policy = requireObject(value["listenerPolicy"]);
        policy["documentMutationRegistersListeners"] = true;
      });
      await expectRejected(root, "U1_CONTRACT_LISTENER_POLICY");
    });
  });

  test("rejects production authorship and premature acceptance claims", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "u1-editing-contract.json", (value) => {
        value["expectedValuesGenerated"] = true;
        value["humanAcceptanceClaim"] = true;
        value["uiCompletionClaim"] = true;
      });
      await expectRejected(root, "U1_CONTRACT_INDEPENDENCE");
    });
  });

  test("rejects broken reciprocal links and law coverage", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "trace-ledger.json", (value) => {
        const coverage = requireArray(value["lawCoverage"]);
        requireObject(coverage[0])["positiveCaseIds"] = [];
        const traces = requireArray(value["traces"]);
        requireArray(requireObject(traces[1])["caseIds"]).push("U1-QE-999");
      });
      await expectRejected(
        root,
        "U1_CONTRACT_LAW_COVERAGE",
        "U1_CONTRACT_UNKNOWN_LINK",
      );
    });
  });

  test("rejects a disarmed mutation control", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "mutation-controls.json", (value) => {
        const controls = requireArray(value["controls"]);
        const control = requireObject(controls[0]);
        const mutation = requireObject(control["mutation"]);
        mutation["to"] = mutation["from"];
      });
      await expectRejected(root, "U1_CONTRACT_MUTATION_CONTROL");
    });
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "mutation-controls.json", (value) => {
        const controls = requireArray(value["controls"]);
        const control = requireObject(controls[1]);
        const observation = requireObject(control["observation"]);
        observation["jsonPointer"] = requireObject(
          control["mutation"],
        )["jsonPointer"];
      });
      await expectRejected(root, "U1_CONTRACT_MUTATION_CONTROL");
    });
  });

  test("rejects independently repinned semantic tampering", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "quick-entry-cases.json", (value) => {
        const cases = requireArray(value["cases"]);
        requireObject(requireObject(cases[1])["expected"])["committable"] = false;
      });
      const source = await readFile(join(root, "quick-entry-cases.json"));
      const repinned = new Bun.CryptoHasher("sha256")
        .update(source)
        .digest("hex");
      await mutateJson(root, "u1-editing-contract.json", (value) => {
        requireObject(value["companionSha256"])["quick-entry-cases.json"] =
          repinned;
      });
      const report = await validateU1Contract(root);
      expect(report.outcome).toBe("fail");
      expect(codes(report)).toContain("U1_CONTRACT_SEMANTIC_DIGEST");
    });
  });
});
