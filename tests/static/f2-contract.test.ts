import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DOCUMENT_DECODER_CONTRACT_SCHEMA,
  DOCUMENT_DECODER_OPERATION_NAMES,
  DOCUMENT_IMPORT_BYTE_ISSUE_CODES,
  DOCUMENT_SHAPE_ISSUE_CODES,
  type DecodeDocumentShape,
  type DocumentDecodeOperations,
  type DocumentDecoderIssue,
  type DocumentImportByteObservation,
  type DocumentImportBytePreflightResult,
  type DocumentShapeDecodeResult,
  type PreflightDocumentImportBytes,
  type ProgressionDocumentShapeV2,
} from "../../src/domain";
import {
  F2_REVIEWED_DOCUMENT_SHAPE_ISSUE_CODES,
  validateF2Contract,
  type F2ContractValidationReport,
} from "../../scripts/validate-f2-contract";

setDefaultTimeout(60_000);

type JsonObject = Record<string, unknown>;
type Assert<T extends true> = T;
type Equal<Left, Right> =
  [Left] extends [Right]
    ? [Right] extends [Left]
      ? true
      : false
    : false;
type ShapeIssueCode = Extract<
  DocumentShapeDecodeResult,
  { ok: false }
>["errors"][number]["code"];
type ImportIssueCode = Extract<
  DocumentImportBytePreflightResult,
  { ok: false }
>["errors"][number]["code"];
type ShapeIssue = Extract<
  DocumentShapeDecodeResult,
  { ok: false }
>["errors"][number];
type ImportIssue = Extract<
  DocumentImportBytePreflightResult,
  { ok: false }
>["errors"][number];

const typeAssertions: readonly [
  Assert<
    Equal<
      Extract<DocumentShapeDecodeResult, { ok: true }>["value"],
      ProgressionDocumentShapeV2
    >
  >,
  Assert<Equal<Parameters<DecodeDocumentShape>, [input: unknown]>>,
  Assert<Equal<ReturnType<DecodeDocumentShape>, DocumentShapeDecodeResult>>,
  Assert<
    Equal<Parameters<PreflightDocumentImportBytes>, [utf8ByteLength: number]>
  >,
  Assert<
    Equal<
      ReturnType<PreflightDocumentImportBytes>,
      DocumentImportBytePreflightResult
    >
  >,
  Assert<
    Equal<
      keyof Extract<DocumentShapeDecodeResult, { ok: true }>,
      "ok" | "value" | "warnings"
    >
  >,
  Assert<
    Equal<
      Extract<DocumentShapeDecodeResult, { ok: true }>["warnings"],
      readonly []
    >
  >,
  Assert<
    Equal<
      keyof Extract<DocumentShapeDecodeResult, { ok: false }>,
      "ok" | "errors"
    >
  >,
  Assert<Equal<ShapeIssueCode, (typeof DOCUMENT_SHAPE_ISSUE_CODES)[number]>>,
  Assert<Equal<keyof ShapeIssue, "code" | "path" | "message">>,
  Assert<Equal<Extract<ShapeIssueCode, "measure.reason_blank">, never>>,
  Assert<
    Equal<
      Extract<DocumentImportBytePreflightResult, { ok: true }>["value"],
      DocumentImportByteObservation
    >
  >,
  Assert<
    Equal<
      keyof Extract<DocumentImportBytePreflightResult, { ok: true }>,
      "ok" | "value" | "warnings"
    >
  >,
  Assert<
    Equal<
      Extract<DocumentImportBytePreflightResult, { ok: true }>["warnings"],
      readonly []
    >
  >,
  Assert<
    Equal<
      keyof Extract<DocumentImportBytePreflightResult, { ok: false }>,
      "ok" | "errors"
    >
  >,
  Assert<
    Equal<ImportIssueCode, (typeof DOCUMENT_IMPORT_BYTE_ISSUE_CODES)[number]>
  >,
  Assert<Equal<keyof ImportIssue, "code" | "path" | "message">>,
  Assert<
    Equal<
      keyof DocumentDecoderIssue<ShapeIssueCode>,
      "code" | "path" | "message"
    >
  >,
] = [
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
];

const documentDecodeOperationsWitness = {
  preflightDocumentImportBytes: (
    utf8ByteLength: number,
  ): DocumentImportBytePreflightResult => {
    void utf8ByteLength;
    throw new Error("compile-time interface witness only");
  },
  decodeDocumentShape: (input: unknown): DocumentShapeDecodeResult => {
    void input;
    throw new Error("compile-time interface witness only");
  },
} satisfies DocumentDecodeOperations;

const interfaceAssertions: readonly [
  Assert<
    Equal<
      keyof typeof documentDecodeOperationsWitness,
      keyof DocumentDecodeOperations
    >
  >,
  Assert<
    Equal<
      DocumentDecodeOperations,
      Readonly<{
        preflightDocumentImportBytes: PreflightDocumentImportBytes;
        decodeDocumentShape: DecodeDocumentShape;
      }>
    >
  >,
] = [true, true];

const sourceFixtureRoot = fileURLToPath(
  new URL("../fixtures/decoder", import.meta.url),
);
const contractDocumentPath = fileURLToPath(
  new URL("../../docs/F2_DECODER_CONTRACT.md", import.meta.url),
);

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, label: string): JsonObject {
  if (!isObject(value)) throw new Error(`F2_TEST_OBJECT: ${label}`);
  return value;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`F2_TEST_ARRAY: ${label}`);
  return value;
}

function findingCodes(report: F2ContractValidationReport): readonly string[] {
  return [...new Set(report.findings.map((finding) => finding.code))].sort();
}

async function readJsonObject(path: string): Promise<JsonObject> {
  return requireObject(JSON.parse(await readFile(path, "utf8")), path);
}

async function mutateJson(
  root: string,
  filename: string,
  mutate: (value: JsonObject) => void,
): Promise<void> {
  const path = join(root, filename);
  const value = await readJsonObject(path);
  mutate(value);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function withFixtureCopy(
  run: (root: string) => Promise<void>,
): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), "jcpe f2 contract Ω path-"));
  const root = join(parent, "reviewed decoder fixtures");
  try {
    await cp(sourceFixtureRoot, root, { recursive: true });
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

async function expectRejected(
  root: string,
  ...codes: readonly string[]
): Promise<F2ContractValidationReport> {
  const report = await validateF2Contract(root);
  expect(report.outcome).toBe("fail");
  const actual = findingCodes(report);
  for (const code of codes) expect(actual).toContain(code);
  return report;
}

describe("F2 independently authored decoder contract", () => {
  test("accepts the complete authority set deterministically", async () => {
    const first = await validateF2Contract(sourceFixtureRoot);
    const second = await validateF2Contract(sourceFixtureRoot);

    expect(first).toEqual(second);
    expect(first).toEqual({
      schema: "changes.validation.f2-contract.v1",
      package: "F2",
      outcome: "pass",
      counts: {
        companions: 4,
        shapeCases: 33,
        adversarialCases: 32,
        totalCases: 65,
        traces: 12,
        authorities: 5,
        seeds: 8,
        mutationControls: 244,
        objectSchemas: 21,
      },
      findings: [],
    });
    expect(JSON.stringify(first)).not.toContain(sourceFixtureRoot);
  });

  test("exports the exact code-facing F2 interface identity", () => {
    const shapeIssueCodes: readonly string[] = DOCUMENT_SHAPE_ISSUE_CODES;
    expect(Object.keys(documentDecodeOperationsWitness).sort()).toEqual([
      "decodeDocumentShape",
      "preflightDocumentImportBytes",
    ]);
    expect(typeAssertions).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(interfaceAssertions).toEqual([true, true]);
    expect(DOCUMENT_DECODER_CONTRACT_SCHEMA).toBe(
      "changes.domain.document-decoder-contract.v1",
    );
    expect(DOCUMENT_DECODER_OPERATION_NAMES).toEqual([
      "preflightDocumentImportBytes",
      "decodeDocumentShape",
    ]);
    expect(DOCUMENT_IMPORT_BYTE_ISSUE_CODES).toEqual([
      "shape.invalid_type",
      "limit.import_bytes_exceeded",
    ]);
    expect(DOCUMENT_SHAPE_ISSUE_CODES).toContain("id.duplicate");
    expect(DOCUMENT_SHAPE_ISSUE_CODES).toContain("beat.not_normalized");
    expect(shapeIssueCodes).not.toContain("limit.import_bytes_exceeded");
    expect(shapeIssueCodes).not.toContain("id.reference_missing");
    expect(shapeIssueCodes).not.toContain("measure.reason_blank");
    expect(DOCUMENT_SHAPE_ISSUE_CODES).toEqual(
      F2_REVIEWED_DOCUMENT_SHAPE_ISSUE_CODES,
    );
  });

  test("locks the handoff document to the important executable decisions", async () => {
    const contract = await readFile(contractDocumentPath, "utf8");
    for (const marker of [
      "ProgressionDocumentShapeV2",
      "preflightDocumentImportBytes",
      "decodeDocumentShape(input: unknown)",
      "Shared acyclic containers are accepted",
      "Partial-completion reason blankness",
      "Negative zero is noncanonical for a Beat numerator",
      "id.reference_missing",
      "Proxy trap itself never returns",
      "warnings: []",
      "Forbidden shortcuts",
    ]) {
      expect(contract).toContain(marker);
    }
    expect(contract).not.toContain("decodeDocumentShape(input: any)");
  });

  test("rejects a missing companion", async () => {
    await withFixtureCopy(async (root) => {
      await rm(join(root, "shape-cases.json"));
      await expectRejected(root, "F2_COMPANION_MISSING", "F2_FILE_INVENTORY");
    });
  });

  test("rejects a duplicate or unordered case ID", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "shape-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "shape cases");
        const first = requireObject(cases[0], "first shape case");
        const second = requireObject(cases[1], "second shape case");
        second["id"] = first["id"];
      });
      await expectRejected(root, "F2_CASE_ID_DUPLICATE", "F2_CASE_ID_ORDER");
    });
  });

  test("rejects a weakened numeric limit", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "f2-decoder-contract.json", (manifest) => {
        requireObject(manifest["fixedLimits"], "fixed limits")["maxEventsPerDocument"] = 8_193;
      });
      await expectRejected(root, "F2_FIXED_LIMIT");
    });
  });

  test("rejects drift in the unpinned manifest description", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "f2-decoder-contract.json", (manifest) => {
        manifest["description"] = "Ambiguous decoder authority";
      });
      await expectRejected(
        root,
        "F2_MANIFEST_IDENTITY",
        "F2_SEMANTIC_SNAPSHOT",
      );
    });
  });

  test("rejects drift in an exact object field surface", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "f2-decoder-contract.json", (manifest) => {
        const schemas = requireArray(manifest["objectSchemas"], "object schemas");
        const document = schemas.find(
          (raw) => isObject(raw) && raw["id"] === "document",
        );
        requireObject(document, "document schema")["requiredFields"] = ["schema"];
      });
      await expectRejected(root, "F2_OBJECT_SCHEMA");
    });
  });

  test("rejects discriminator drift in a union object schema", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "f2-decoder-contract.json", (manifest) => {
        const schemas = requireArray(manifest["objectSchemas"], "object schemas");
        const parsedChord = schemas.find(
          (raw) => isObject(raw) && raw["id"] === "parsed-chord",
        );
        delete requireObject(parsedChord, "parsed chord schema")["discriminator"];
      });
      await expectRejected(root, "F2_OBJECT_SCHEMA");
    });
  });

  test("rejects broken materialization, activation, fragment, and target references", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "shape-cases.json", (fixture) => {
        delete requireObject(
          fixture["materializationProtocol"],
          "materialization protocol",
        )["directInputExpansion"];

        const activations = requireObject(
          fixture["activationProtocol"],
          "activation protocol",
        );
        const manual = requireArray(activations["manualVoicing"], "manual activation");
        requireObject(manual[0], "manual activation operation")["fragment"] =
          "missingFragment";

        const schemaTargets = requireArray(
          fixture["schemaVariantTargets"],
          "schema variant targets",
        );
        const firstVariants = requireArray(
          requireObject(schemaTargets[0], "first schema target")["variants"],
          "first variants",
        );
        requireObject(firstVariants[0], "first variant")["activation"] =
          "missingActivation";
      });
      await mutateJson(root, "adversarial-cases.json", (fixture) => {
        const targets = requireArray(
          fixture["arrayConsumerTargets"],
          "array consumer targets",
        );
        requireObject(targets[0], "first array target")["path"] = [
          "missingTarget",
        ];
      });
      await expectRejected(
        root,
        "F2_MATERIALIZATION_PROTOCOL",
        "F2_ACTIVATION_REFERENCE",
        "F2_FRAGMENT_REFERENCE",
        "F2_TARGET_REFERENCE",
      );
    });
  });

  test("rejects schema-target inventory and activated field-type drift", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "shape-cases.json", (fixture) => {
        const targets = requireArray(
          fixture["schemaVariantTargets"],
          "schema variant targets",
        );
        const first = requireObject(targets[0], "first schema target");
        const variants = requireArray(first["variants"], "first variants");
        const variant = requireObject(variants[0], "first variant");
        requireObject(variant["fieldTypes"], "first field types")[
          "voiceCount"
        ] = "string";
        targets.pop();
      });
      await expectRejected(
        root,
        "F2_SCHEMA_VARIANT",
        "F2_SCHEMA_VARIANT_INVENTORY",
      );
    });
  });

  test("rejects declared atomic-cell count drift", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "shape-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "shape cases");
        const chord = cases.find(
          (raw) => isObject(raw) && raw["id"] === "F2-CHORD-001",
        );
        requireObject(
          requireObject(chord, "chord case")["cellExpansion"],
          "chord expansion",
        )["atomicCellCount"] = 68;
      });
      await expectRejected(root, "F2_CELL_EXPANSION");
    });
  });

  test("rejects replay cell indices and exclusion drift", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "adversarial-cases.json", (fixture) => {
        const replay = requireObject(
          fixture["seededReplayProtocol"],
          "seeded replay protocol",
        );
        replay["cellIndexForbidden"] = false;
        replay["selection"] = "shuffle somehow";
        replay["excludedCaseIds"] = [
          { id: "F2-NOT-A-CASE-999", reason: "weakened replay" },
        ];
      });
      await expectRejected(
        root,
        "F2_REPLAY_PROTOCOL",
        "F2_REPLAY_EXCLUSION",
        "F2_REPLAY_CAMPAIGN",
      );
    });
  });

  test("rejects weakened static publication and cast obligations", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "adversarial-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "adversarial cases");
        const staticProof = cases.find(
          (raw) => isObject(raw) && raw["id"] === "F2-STATIC-001",
        );
        const expected = requireObject(
          requireObject(staticProof, "static proof")["expected"],
          "static expected",
        );
        requireArray(expected["forbiddenSyntax"], "forbidden syntax").pop();
        expected["evidenceSeamsPublic"] = true;
        requireArray(expected["evidenceSeams"], "evidence seams").pop();
        requireArray(
          expected["decoderEvidenceKeys"],
          "decoder evidence keys",
        ).pop();
        requireObject(
          expected["moduleRetentionStaticPolicy"],
          "module retention policy",
        )["moduleScopeLetOrVarCount"] = 1;
        requireObject(
          expected["iterativeDepthStaticPolicy"],
          "iterative depth policy",
        )["explicitLocalWorklistLoopRequired"] = false;
        requireObject(
          expected["untrustedInputStaticPolicy"],
          "untrusted-input policy",
        )["directContainerReadsOutsideSnapshot"] = 1;
        requireObject(
          expected["candidateConstructionStaticPolicy"],
          "candidate-construction policy",
        )["candidateContainersCreatedOutsideFactories"] = 1;
        requireObject(
          expected["publicPrivateParityStaticPolicy"],
          "public/private parity policy",
        )["oneSharedCore"] = false;
        requireArray(
          expected["forbiddenAstPatterns"],
          "forbidden AST patterns",
        ).pop();
        expected["evidenceResultsRecursivelyFrozen"] = false;
        expected["operationsValueRecursivelyFrozen"] = false;
        requireArray(
          expected["operationsOwnKeysInOrder"],
          "operations own keys",
        ).reverse();
      });
      await expectRejected(root, "F2_STATIC_OBLIGATIONS");
    });
  });

  test("rejects deletion from the exact evidence-counter inventory", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "adversarial-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "adversarial cases");
        const work = cases.find(
          (raw) => isObject(raw) && raw["id"] === "F2-WORK-001",
        );
        requireArray(
          requireObject(work, "work campaign")["requiredCounters"],
          "required counters",
        ).pop();
      });
      await expectRejected(root, "F2_COUNTER_INVENTORY");
    });
  });

  test("rejects a renamed counter-semantics key", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "adversarial-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "adversarial cases");
        const work = cases.find(
          (raw) => isObject(raw) && raw["id"] === "F2-WORK-001",
        );
        const semantics = requireObject(
          requireObject(work, "work campaign")["counterSemantics"],
          "counter semantics",
        );
        semantics["bytesSeen"] = semantics["bytesObserved"];
        delete semantics["bytesObserved"];
      });
      await expectRejected(root, "F2_COUNTER_SEMANTICS");
    });
  });

  test("rejects evidence partition and counter-golden shape drift", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "adversarial-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "adversarial cases");
        const work = requireObject(
          cases.find(
            (raw) => isObject(raw) && raw["id"] === "F2-WORK-001",
          ),
          "work campaign",
        );
        requireArray(
          work["decoderEvidenceCounters"],
          "decoder evidence counters",
        ).pop();
        delete requireObject(
          work["zeroDecoderEvidence"],
          "zero decoder evidence",
        )["timelineTicksObserved"];
        requireArray(work["counterGoldenCells"], "counter golden cells").pop();
      });
      await expectRejected(
        root,
        "F2_COUNTER_PARTITION",
        "F2_COUNTER_GOLDEN",
        "F2_SEMANTIC_SNAPSHOT",
      );
    });
  });

  test("rejects exact numeric counter-golden drift", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "adversarial-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "adversarial cases");
        const work = requireObject(
          cases.find(
            (raw) => isObject(raw) && raw["id"] === "F2-WORK-001",
          ),
          "work campaign",
        );
        const goldens = requireArray(
          work["counterGoldenCells"],
          "counter golden cells",
        );
        requireObject(
          requireObject(goldens[0], "representative golden")[
            "expectedDecoderEvidence"
          ],
          "representative decoder evidence",
        )["maxDepthObserved"] = 8;
      });
      await expectRejected(
        root,
        "F2_COUNTER_GOLDEN",
        "F2_SEMANTIC_SNAPSHOT",
      );
    });
  });

  test("rejects exact protocol and counter-semantics weakening", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "shape-cases.json", (fixture) => {
        requireObject(
          fixture["materializationProtocol"],
          "materialization protocol",
        )["set"] = "Ignore the path and replace an arbitrary property.";
      });
      await expectRejected(
        root,
        "F2_MATERIALIZATION_PROTOCOL",
        "F2_SEMANTIC_SNAPSHOT",
      );
    });

    await withFixtureCopy(async (root) => {
      await mutateJson(root, "adversarial-cases.json", (fixture) => {
        requireObject(
          fixture["seededReplayProtocol"],
          "seeded replay protocol",
        )["transition"] = "Return zero for every transition.";
      });
      await expectRejected(
        root,
        "F2_REPLAY_PROTOCOL",
        "F2_SEMANTIC_SNAPSHOT",
      );
    });

    await withFixtureCopy(async (root) => {
      await mutateJson(root, "adversarial-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "adversarial cases");
        const work = cases.find(
          (raw) => isObject(raw) && raw["id"] === "F2-WORK-001",
        );
        requireObject(
          requireObject(work, "work campaign")["counterSemantics"],
          "counter semantics",
        )["bytesObserved"] = "always zero";
      });
      await expectRejected(
        root,
        "F2_COUNTER_SEMANTICS",
        "F2_SEMANTIC_SNAPSHOT",
      );
    });
  });

  test("rejects undefined event branch-fragment tokens", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "adversarial-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "adversarial cases");
        const limit = requireObject(
          cases.find(
            (raw) => isObject(raw) && raw["id"] === "F2-LIMIT-011",
          ),
          "limit case",
        );
        const cells = requireArray(
          limit["preflightBeforeSemanticCells"],
          "preflight-before-semantic cells",
        );
        const event = requireObject(
          requireObject(cells[0], "first precedence cell")["event"],
          "precedence event",
        );
        requireObject(event["fragments"], "event fragments")["voicing"] =
          "autoVoicing";
        const freshness = requireObject(
          cases.find(
            (raw) => isObject(raw) && raw["id"] === "F2-FRESH-001",
          ),
          "freshness case",
        );
        const freshnessCells = requireArray(
          freshness["cellExpansion"],
          "freshness cells",
        );
        requireObject(freshnessCells[0], "first freshness cell")["template"] =
          "shape-cases.json:templates.missingDocument";
      });
      await expectRejected(
        root,
        "F2_FRAGMENT_REFERENCE",
        "F2_MATERIALIZATION_REFERENCE",
        "F2_SEMANTIC_SNAPSHOT",
      );
    });
  });

  test("rejects deletions from exact hostile and default-cell inventories", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "adversarial-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "adversarial cases");
        const boundary = cases.find(
          (raw) => isObject(raw) && raw["id"] === "F2-BOUNDARY-001",
        );
        requireArray(
          requireObject(boundary, "boundary case")["inputs"],
          "boundary inputs",
        ).pop();
        for (const [id, field] of [
          ["F2-HOST-001", "paths"],
          ["F2-HOST-002", "cells"],
          ["F2-HOST-003", "cells"],
        ] as const) {
          const fixtureCase = cases.find(
            (raw) => isObject(raw) && raw["id"] === id,
          );
          requireArray(
            requireObject(fixtureCase, id)[field],
            `${id} ${field}`,
          ).pop();
        }
        const limit = cases.find(
          (raw) => isObject(raw) && raw["id"] === "F2-LIMIT-011",
        );
        requireArray(
          requireObject(limit, "limit case")["crossSiblingReachabilityCells"],
          "same-event reachability cells",
        ).pop();
        requireArray(
          requireObject(limit, "limit case")["preflightBeforeSemanticCells"],
          "preflight-before-semantic cells",
        ).pop();
      });
      await mutateJson(root, "shape-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "shape cases");
        for (const [id, field] of [
          ["F2-SHAPE-008", "inputs"],
          ["F2-FIELD-005", "cells"],
        ] as const) {
          const fixtureCase = cases.find(
            (raw) => isObject(raw) && raw["id"] === id,
          );
          requireArray(
            requireObject(fixtureCase, id)[field],
            `${id} ${field}`,
          ).pop();
        }
        const values = requireObject(
          cases.find(
            (raw) => isObject(raw) && raw["id"] === "F2-VALUE-002",
          ),
          "value case",
        );
        requireArray(values["idBoundaryCells"], "ID boundary cells").pop();
        requireArray(
          values["storedPitchOctaveFaults"],
          "stored-pitch octave faults",
        ).pop();
        delete values["additionalDegreeNumberRefusalCell"];
        requireArray(
          values["degreeNegativeZeroPreservationCells"],
          "degree negative-zero cells",
        ).pop();
        requireArray(
          values["additionalNegativeZeroPreservationCells"],
          "additional negative-zero cells",
        ).pop();
        const text = requireObject(
          cases.find(
            (raw) => isObject(raw) && raw["id"] === "F2-TEXT-002",
          ),
          "text case",
        );
        requireArray(
          text["consumerCoDiagnosticCells"],
          "free-text co-diagnostic cells",
        ).pop();
        const time = requireObject(
          cases.find(
            (raw) => isObject(raw) && raw["id"] === "F2-TIME-001",
          ),
          "time case",
        );
        requireArray(
          time["expectedDurationBeatCells"],
          "expected-duration beat cells",
        ).pop();
        const mismatch = requireObject(
          cases.find(
            (raw) => isObject(raw) && raw["id"] === "F2-SHAPE-005",
          ),
          "shape mismatch case",
        );
        delete mismatch["frozenCounterpart"];
        const duplicate = requireObject(
          cases.find(
            (raw) => isObject(raw) && raw["id"] === "F2-ID-003",
          ),
          "duplicate case",
        );
        delete duplicate["invalidSiblingCounterpart"];
      });
      await expectRejected(
        root,
        "F2_CRITICAL_CELL_INVENTORY",
        "F2_SEMANTIC_SNAPSHOT",
      );
    });
  });

  test("rejects exact target-registry deletion and dangling text IDs", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "adversarial-cases.json", (fixture) => {
        requireArray(
          fixture["arrayConsumerTargets"],
          "array consumer targets",
        ).pop();
      });
      await mutateJson(root, "shape-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "shape cases");
        const values = cases.find(
          (raw) => isObject(raw) && raw["id"] === "F2-VALUE-002",
        );
        requireArray(
          requireObject(values, "value case")["idConsumerTargets"],
          "ID targets",
        ).pop();
      });
      await expectRejected(
        root,
        "F2_TARGET_INVENTORY",
        "F2_SEMANTIC_SNAPSHOT",
      );
    });

    await withFixtureCopy(async (root) => {
      await mutateJson(root, "shape-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "shape cases");
        const text = cases.find(
          (raw) => isObject(raw) && raw["id"] === "F2-TEXT-002",
        );
        const targets = requireArray(
          requireObject(text, "text case")["freeTextTargets"],
          "free-text targets",
        );
        const description = targets.find(
          (raw) => isObject(raw) && raw["id"] === "description",
        );
        requireObject(description, "description target")["id"] =
          "description-renamed";
      });
      await expectRejected(
        root,
        "F2_TARGET_INVENTORY",
        "F2_TARGET_REFERENCE",
        "F2_SEMANTIC_SNAPSHOT",
      );
    });
  });

  test("rejects mutation-control ownership summary drift", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "adversarial-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "adversarial cases");
        const mutation = cases.find(
          (raw) => isObject(raw) && raw["id"] === "F2-MUTATION-001",
        );
        requireObject(
          requireObject(mutation, "mutation summary")["expected"],
          "mutation expected",
        )["f2OwnedControls"] = 233;
      });
      await expectRejected(root, "F2_MUTATION_SUMMARY");
    });
  });

  test("rejects arbitrary fixture-body drift through both snapshot layers", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "shape-cases.json", (fixture) => {
        requireObject(
          requireObject(fixture["templates"], "templates")["minimalDocument"],
          "minimal document",
        )["title"] = "Gutted authority";
      });
      await expectRejected(
        root,
        "F2_REVIEWED_DIGEST",
        "F2_SEMANTIC_SNAPSHOT",
      );
    });
  });

  test("rejects an expected issue code outside the reviewed F2 vocabulary", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "shape-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "shape cases");
        const caseRecord = requireObject(cases[1], "second case");
        const expected = requireObject(caseRecord["expected"], "expected");
        expected["issues"] = [
          { code: "measure.reason_blank", path: ["sections", 0] },
        ];
      });
      await expectRejected(root, "F2_EXPECTED_ISSUE_CODE_UNKNOWN");
    });
  });

  test("rejects a missing case-to-trace backlink", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "shape-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "shape cases");
        const shape = cases.find(
          (raw) => isObject(raw) && raw["id"] === "F2-SHAPE-001",
        );
        requireObject(shape, "F2-SHAPE-001")["traceIds"] = [
          "F2-TRACE-STRICT-SHAPE",
        ];
      });
      await expectRejected(root, "F2_TRACE_CASE_BACKLINK");
    });
  });

  test("rejects an empty or unbacklinked trace proof map", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "trace-ledger.json", (fixture) => {
        const traces = requireArray(fixture["traces"], "traces");
        const trace = requireObject(traces[0], "first trace");
        trace["proofCaseIds"] = {};
      });
      await expectRejected(root, "F2_TRACE_PROOF_MAP");
    });
  });

  test("rejects a trace whose proof kinds do not cover every required case", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "trace-ledger.json", (fixture) => {
        const traces = requireArray(fixture["traces"], "traces");
        const trace = requireObject(traces[1], "bounds trace");
        const proofMap = requireObject(trace["proofCaseIds"], "proof map");
        proofMap["preflight"] = [
          "F2-LIMIT-006",
          "F2-LIMIT-008",
          "F2-LIMIT-010",
        ];
      });
      await expectRejected(root, "F2_TRACE_PROOF_COVERAGE");
    });
  });

  test("rejects coherent proof-kind reclassification", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "trace-ledger.json", (fixture) => {
        const traces = requireArray(fixture["traces"], "traces");
        const apiTrace = traces.find(
          (raw) => isObject(raw) && raw["id"] === "F2-TRACE-API",
        );
        const proofMap = requireObject(
          requireObject(apiTrace, "API trace")["proofCaseIds"],
          "API proof map",
        );
        const boundary = requireArray(proofMap["boundary"], "boundary cases");
        const positive = requireArray(proofMap["positive"], "positive cases");
        const moved = boundary.shift();
        if (typeof moved !== "string") {
          throw new Error("F2_TEST_PROOF_MOVE: missing boundary case");
        }
        positive.push(moved);
      });
      await expectRejected(
        root,
        "F2_TRACE_PROOF_CLASSIFICATION",
        "F2_SEMANTIC_SNAPSHOT",
      );
    });
  });

  test("rejects production-generated provenance", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "provenance-ledger.json", (provenance) => {
        provenance["expectedValuesGenerated"] = true;
      });
      await expectRejected(
        root,
        "F2_PROVENANCE_POLICY",
        "F2_SEMANTIC_SNAPSHOT",
      );
    });
  });

  test("rejects a changed deterministic seed", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "adversarial-cases.json", (fixture) => {
        const seeds = requireArray(fixture["stableSeeds"], "stable seeds");
        requireObject(seeds[0], "first seed")["value"] = 1;
      });
      await expectRejected(root, "F2_SEED_INVENTORY");
    });
  });

  test("rejects a missing named mutation control", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "adversarial-cases.json", (fixture) => {
        requireArray(fixture["mutationControls"], "mutation controls").pop();
      });
      await expectRejected(
        root,
        "F2_MUTATION_INVENTORY",
        "F2_COVERAGE_SUMMARY",
      );
    });
  });

  test("rejects an unknown mutation-control case mapping", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "adversarial-cases.json", (fixture) => {
        const controls = requireArray(
          fixture["mutationControls"],
          "mutation controls",
        );
        requireObject(controls[0], "first mutation control")["caseIds"] = [
          "F2-NOT-A-CASE-999",
        ];
      });
      await expectRejected(root, "F2_MUTATION_CASE_UNKNOWN");
    });
  });

  test("rejects loss of an executable case's killer mapping", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "adversarial-cases.json", (fixture) => {
        const controls = requireArray(
          fixture["mutationControls"],
          "mutation controls",
        );
        const soleChordMapping = controls.find(
          (raw) =>
            isObject(raw) &&
            Array.isArray(raw["caseIds"]) &&
            raw["caseIds"].some(
              (caseId: unknown) => caseId === "F2-CHORD-003",
            ),
        );
        requireObject(soleChordMapping, "sole chord mapping")["caseIds"] = [
          "F2-SHAPE-001",
        ];
      });
      await expectRejected(
        root,
        "F2_MUTATION_CASE_COVERAGE",
        "F2_MUTATION_LEDGER",
        "F2_SEMANTIC_SNAPSHOT",
      );
    });
  });

  test("rejects coherent mutation fault and killer-case drift", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "adversarial-cases.json", (fixture) => {
        const controls = requireArray(
          fixture["mutationControls"],
          "mutation controls",
        );
        requireObject(controls[0], "first mutation control")["fault"] =
          "implementation remains correct";
      });
      await expectRejected(
        root,
        "F2_MUTATION_LEDGER",
        "F2_SEMANTIC_SNAPSHOT",
      );
    });

    await withFixtureCopy(async (root) => {
      await mutateJson(root, "adversarial-cases.json", (fixture) => {
        const controls = requireArray(
          fixture["mutationControls"],
          "mutation controls",
        );
        requireObject(controls[0], "first mutation control")["caseIds"] = [
          "F2-SHAPE-001",
        ];
      });
      await expectRejected(
        root,
        "F2_MUTATION_LEDGER",
        "F2_SEMANTIC_SNAPSHOT",
      );
    });
  });

  test("rejects unsorted or duplicate golden issue sequences", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "adversarial-cases.json", (fixture) => {
        const cases = requireArray(fixture["cases"], "adversarial cases");
        const order = cases.find(
          (raw) => isObject(raw) && raw["id"] === "F2-ORDER-003",
        );
        const expected = requireObject(
          requireObject(order, "order case")["expected"],
          "order expected",
        );
        requireArray(expected["issues"], "ordered issues").reverse();
      });
      await expectRejected(root, "F2_EXPECTED_ISSUE_ORDER");
    });
  });

  test("rejects duplicate decoded keys in reviewed JSON", async () => {
    await withFixtureCopy(async (root) => {
      const path = join(root, "shape-cases.json");
      const source = await readFile(path, "utf8");
      await writeFile(
        path,
        source.replace(
          '"schema": "changes.fixtures.f2-shape-cases.v1",',
          '"schema": "changes.fixtures.f2-shape-cases.v1",\n  "\\u0073chema": "changes.fixtures.f2-shape-cases.v1",',
        ),
        "utf8",
      );
      await expectRejected(root, "F2_JSON_DUPLICATE_KEY");
    });
  });

  test("rejects public operation and operations-value identity drift", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "f2-decoder-contract.json", (manifest) => {
        requireObject(manifest["publicSurface"], "public surface")[
          "operationOrder"
        ] = ["decodeDocumentShape"];
      });
      await expectRejected(root, "F2_PUBLIC_SURFACE");
    });

    const operationsValueMutations: readonly ((
      operationsValue: JsonObject,
    ) => void)[] = [
      (operationsValue) => {
        operationsValue["name"] = "decoderOperations";
      },
      (operationsValue) => {
        operationsValue["ownKeysInOrder"] = ["decodeDocumentShape"];
      },
      (operationsValue) => {
        operationsValue["membersEqualNamedFunctionExports"] = false;
      },
      (operationsValue) => {
        operationsValue["recursivelyFrozen"] = false;
      },
      (operationsValue) => {
        operationsValue["reexportedFromDomainIndex"] = false;
      },
    ];

    for (const mutateOperationsValue of operationsValueMutations) {
      await withFixtureCopy(async (root) => {
        await mutateJson(root, "f2-decoder-contract.json", (manifest) => {
          const publicSurface = requireObject(
            manifest["publicSurface"],
            "public surface",
          );
          mutateOperationsValue(
            requireObject(
              publicSurface["operationsValue"],
              "operations value",
            ),
          );
        });
        await expectRejected(root, "F2_PUBLIC_SURFACE");
      });
    }
  });

  test("rejects private evidence-surface publication drift", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "f2-decoder-contract.json", (manifest) => {
        const evidence = requireObject(
          manifest["internalEvidenceSurface"],
          "internal evidence surface",
        );
        requireArray(evidence["seams"], "private evidence seams").pop();
        evidence["decoderEvidenceCounterCount"] = 27;
        evidence["publicIndexExported"] = true;
        evidence["hiddenMutableState"] = true;
      });
      await expectRejected(
        root,
        "F2_INTERNAL_EVIDENCE_SURFACE",
        "F2_SEMANTIC_SNAPSHOT",
      );
    });
  });

  test("rejects an altered reviewed digest pin", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "f2-decoder-contract.json", (manifest) => {
        requireObject(manifest["reviewedDigests"], "reviewed digests")[
          "contractDocumentSha256"
        ] = "0".repeat(64);
      });
      await expectRejected(root, "F2_REVIEWED_DIGEST");
    });
  });
});
