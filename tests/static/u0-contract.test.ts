import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  UI_ALLOWED_CONTRAST_PAIRS,
  UI_CASE_KINDS,
  UI_COMPONENT_INVENTORY,
  UI_COMPONENT_STATES,
  UI_LIMITS,
  UI_MENU_TOPOLOGY_POLICY,
  UI_OPAQUE_VALUE_POLICY,
  UI_OVERLAY_KIND_MODES,
  UI_PUBLIC_COLLECTION_LIMITS,
  UI_PUBLIC_NUMERIC_POLICY,
  UI_PUBLIC_TEXT_LIMITS,
  UI_REFUSAL_CODES,
  UI_REQUIRED_VIEWPORTS,
  UI_TREE_TOPOLOGY_POLICY,
  type UiCheckboxProps,
  type UiComboboxProps,
  type UiRadioGroupProps,
  type UiSelectProps,
  type UiValueChangeEvent,
} from "../../src/ui/ui-contract";
import {
  U0_REVIEWED_ALLOWED_CONTRAST_PAIRS,
  U0_REVIEWED_CASE_KINDS,
  U0_REVIEWED_COMPONENTS,
  U0_REVIEWED_COMPONENT_STATES,
  U0_REVIEWED_LIMITS,
  U0_REVIEWED_MENU_TOPOLOGY_POLICY,
  U0_REVIEWED_OPAQUE_VALUE_POLICY,
  U0_REVIEWED_OVERLAY_KIND_MODES,
  U0_REVIEWED_PUBLIC_COLLECTION_LIMITS,
  U0_REVIEWED_PUBLIC_NUMERIC_POLICY,
  U0_REVIEWED_PUBLIC_TEXT_LIMITS,
  U0_REVIEWED_REFUSAL_CODES,
  U0_REVIEWED_TREE_TOPOLOGY_POLICY,
  U0_REVIEWED_VIEWPORTS,
  validateU0Contract,
  type U0ContractValidationReport,
} from "../../scripts/validate-u0-contract";

setDefaultTimeout(60_000);

type JsonObject = Record<string, unknown>;
type Assert<Value extends true> = Value;
type Equal<Left, Right> =
  [Left] extends [Right]
    ? [Right] extends [Left]
      ? true
      : false
    : false;

type SelectEvent = Parameters<UiSelectProps<"value">["onValueChange"]>[0];
type ComboboxEvent = Parameters<
  UiComboboxProps<"value">["onValueChange"]
>[0];
type RadioEvent = Parameters<UiRadioGroupProps<"value">["onValueChange"]>[0];
type CheckboxEvent = Parameters<UiCheckboxProps["onCheckedChange"]>[0];

const typeAssertions: readonly [
  Assert<
    Equal<SelectEvent, UiValueChangeEvent<"value", "value" | null>>
  >,
  Assert<
    Equal<ComboboxEvent, UiValueChangeEvent<"value" | null>>
  >,
  Assert<
    Equal<RadioEvent, UiValueChangeEvent<"value", "value" | null>>
  >,
  Assert<
    Equal<CheckboxEvent, UiValueChangeEvent<boolean, boolean | "mixed">>
  >,
] = [true, true, true, true];

const fixtureRoot = new URL("../fixtures/ui", import.meta.url).pathname;

function requireObject(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("U0_TEST_OBJECT_REQUIRED");
  }
  return value as JsonObject;
}

function requireArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("U0_TEST_ARRAY_REQUIRED");
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
  const parent = await mkdtemp(join(tmpdir(), "jcpe-u0-contract-"));
  const root = join(parent, "reviewed ui fixtures");
  try {
    await cp(fixtureRoot, root, { recursive: true });
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

function codes(report: U0ContractValidationReport): readonly string[] {
  return [...new Set(report.findings.map((finding) => finding.code))].sort();
}

async function expectRejected(
  root: string,
  ...expectedCodes: readonly string[]
): Promise<void> {
  const report = await validateU0Contract(root);
  expect(report.outcome).toBe("fail");
  for (const code of expectedCodes) expect(codes(report)).toContain(code);
}

describe("U0 reviewed UI contract", () => {
  test("accepts the reviewed corpus deterministically", async () => {
    const first = await validateU0Contract(fixtureRoot);
    const second = await validateU0Contract(fixtureRoot);
    expect(second).toEqual(first);
    expect(first).toEqual({
      schema: "changes.validation.u0-contract.v1",
      package: "U0",
      outcome: "pass",
      counts: {
        companions: 4,
        components: 51,
        primitiveCases: 94,
        galleryCells: 714,
        topologyCases: 13,
        menuTopologyCases: 7,
        contrastCases: 9,
        shellCases: 55,
        traces: 20,
        authorities: 9,
      },
      findings: [],
    });
  });

  test("freezes source contract data and controlled-value event types", () => {
    expect([...typeAssertions]).toEqual([true, true, true, true]);
    expect(JSON.stringify(UI_COMPONENT_INVENTORY)).toBe(
      JSON.stringify(
        U0_REVIEWED_COMPONENTS.map(({ id, name, family, kind }) => ({
          id,
          name,
          family,
          kind,
        })),
      ),
    );
    expect(UI_COMPONENT_STATES).toEqual(U0_REVIEWED_COMPONENT_STATES);
    expect(UI_CASE_KINDS).toEqual(U0_REVIEWED_CASE_KINDS);
    expect(UI_LIMITS).toEqual(U0_REVIEWED_LIMITS);
    expect(UI_REFUSAL_CODES).toEqual(U0_REVIEWED_REFUSAL_CODES);
    expect(UI_REQUIRED_VIEWPORTS).toEqual(U0_REVIEWED_VIEWPORTS);
    expect(UI_ALLOWED_CONTRAST_PAIRS).toEqual(
      U0_REVIEWED_ALLOWED_CONTRAST_PAIRS,
    );
    expect(UI_PUBLIC_COLLECTION_LIMITS).toEqual(
      U0_REVIEWED_PUBLIC_COLLECTION_LIMITS,
    );
    expect(UI_PUBLIC_TEXT_LIMITS).toEqual(U0_REVIEWED_PUBLIC_TEXT_LIMITS);
    expect(UI_PUBLIC_NUMERIC_POLICY).toEqual(
      U0_REVIEWED_PUBLIC_NUMERIC_POLICY,
    );
    expect(UI_OPAQUE_VALUE_POLICY).toEqual(U0_REVIEWED_OPAQUE_VALUE_POLICY);
    expect(UI_MENU_TOPOLOGY_POLICY).toEqual(
      U0_REVIEWED_MENU_TOPOLOGY_POLICY,
    );
    expect(UI_TREE_TOPOLOGY_POLICY).toEqual(
      U0_REVIEWED_TREE_TOPOLOGY_POLICY,
    );
    expect(UI_OVERLAY_KIND_MODES).toEqual(U0_REVIEWED_OVERLAY_KIND_MODES);
  });

  test("rejects missing, extra, malformed, duplicate-key, and unknown-key files", async () => {
    await withFixtureCopy(async (root) => {
      await rm(join(root, "trace-ledger.json"));
      await writeFile(join(root, "extra.json"), "{}\n", "utf8");
      await expectRejected(
        root,
        "U0_CONTRACT_FILE_SET",
        "U0_CONTRACT_FILE_MISSING",
      );
    });
    await withFixtureCopy(async (root) => {
      const path = join(root, "u0-ui-contract.json");
      const source = await readFile(path, "utf8");
      await writeFile(
        path,
        source.replace(
          '"schema": "changes.ui.u0-contract.v1"',
          '"schema": "changes.ui.u0-contract.v1", "\\u0073chema": "changes.ui.u0-contract.v1"',
        ),
        "utf8",
      );
      await expectRejected(root, "U0_CONTRACT_DUPLICATE_KEY");
    });
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "u0-ui-contract.json", (value) => {
        value["unknown"] = true;
        value["contractVersion"] = 2;
      });
      await expectRejected(
        root,
        "U0_CONTRACT_KEYS",
        "U0_CONTRACT_VERSION",
      );
    });
  });

  test("rejects inventory, limit, boundary, and case-kind drift", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "primitive-state-matrix.json", (value) => {
        const components = requireArray(value["components"]);
        requireObject(components[1])["id"] = "U0-CMP-001";
        const cases = requireArray(value["cases"]);
        const limit = requireObject(
          cases.find(
            (item) =>
              requireObject(item)["id"] === "U0-LIM-002",
          ),
        );
        limit["plusOneInput"] = Number(limit["plusOneInput"]) + 1;
        value["cases"] = cases.filter(
          (item) => requireObject(item)["kind"] !== "cancellation",
        );
      });
      await expectRejected(
        root,
        "U0_CONTRACT_DUPLICATE_ID",
        "U0_CONTRACT_COMPONENT_INVENTORY",
        "U0_CONTRACT_LIMIT_BOUNDARY",
        "U0_CONTRACT_CASE_COVERAGE",
        "U0_CONTRACT_FAMILY_COVERAGE",
      );
    });
  });

  test("rejects production authorship and forbidden runtime declarations", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "u0-ui-contract.json", (value) => {
        value["expectedValuesGenerated"] = true;
        const policies = requireObject(value["policies"]);
        policies["runtime"] = "react-and-remote-runtime-allowed";
        const handoff = requireObject(value["handoff"]);
        handoff["forbiddenShortcuts"] = [];
      });
      await expectRejected(
        root,
        "U0_CONTRACT_INDEPENDENCE",
        "U0_CONTRACT_RUNTIME_BOUNDARY",
      );
    });
  });

  test("rejects broken reciprocal and gallery oracle links", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "trace-ledger.json", (value) => {
        const traces = requireArray(value["traces"]);
        const trace = requireObject(
          traces.find(
            (item) => requireObject(item)["id"] === "TR-U0-SOURCE",
          ),
        );
        requireArray(trace["caseIds"]).pop();
      });
      await mutateJson(root, "primitive-state-matrix.json", (value) => {
        const cells = requireArray(value["galleryCells"]);
        delete requireObject(requireObject(cells[0])["expected"])["event"];
      });
      await expectRejected(
        root,
        "U0_CONTRACT_NONRECIPROCAL_LINK",
        "U0_CONTRACT_GALLERY_ORACLE",
      );
    });
  });

  test("rejects topology, contrast, and independently repinned semantic tampering", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "primitive-state-matrix.json", (value) => {
        requireArray(value["menuTopologyCases"]).pop();
        const contrast = requireObject(requireArray(value["contrastCases"])[0]);
        contrast["minimumRatio"] = 1;
      });
      await expectRejected(
        root,
        "U0_CONTRACT_MENU_TOPOLOGY_COVERAGE",
        "U0_CONTRACT_CONTRAST_PAIR",
      );
    });
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "primitive-state-matrix.json", (value) => {
        const component = requireObject(requireArray(value["components"])[0]);
        requireArray(component["semantics"])[0] = "plausible but unreviewed";
      });
      const companionPath = join(root, "primitive-state-matrix.json");
      const companion = await readFile(companionPath);
      const byteDigest = createHash("sha256").update(companion).digest("hex");
      await mutateJson(root, "u0-ui-contract.json", (value) => {
        requireObject(value["reviewedFileSha256"])[
          "primitive-state-matrix.json"
        ] = byteDigest;
      });
      await expectRejected(root, "U0_CONTRACT_SEMANTIC_DIGEST");
    });
  });
});
