import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

import type {
  A0E0InterchangeOwnerOperations,
  A0E0InterchangeOwnerPorts,
  ApplicationDocumentIdentity,
  DiscardImportReplacementPublicationRequest,
  DiscardImportReplacementPublicationOperation,
  DiscardImportReplacementPublicationPort,
  DiscardImportReplacementPublicationResult,
  ImportReplacementHandoff,
  ImportReplacementSourceIdentity,
  ImportRequestIdentity,
  PrepareImportReplacementPublicationOperation,
  PrepareImportReplacementPublicationPort,
  PrepareImportReplacementPublicationRequest,
  PrepareImportReplacementPublicationResult,
  PublishCanonicalExportRevisionRequest,
  PublishCanonicalExportRevisionOperation,
  PublishCanonicalExportRevisionPort,
  PublishCanonicalExportRevisionResult,
  PublishImportReplacementOperation,
  PublishImportReplacementPort,
  PublishImportReplacementResult,
  ReadCurrentApplicationDocumentIdentityOperation,
  ReadCurrentApplicationDocumentIdentityPort,
} from "../../src/application/application-interchange-owner-contract";
import {
  A0_E0_INTERCHANGE_OWNER_LAW_IDS,
  A0_E0_INTERCHANGE_OWNER_OPERATION_NAMES,
  A0_E0_INTERCHANGE_OWNER_REQUEST_AUTHORITY_BOUNDARY,
  IMPORT_REPLACEMENT_ORIGIN_BY_SOURCE_FORMAT,
  IMPORT_REPLACEMENT_PREPARATION_VALIDATION_POLICY,
  IMPORT_REPLACEMENT_PUBLICATION_LATEST_STATE_MERGE,
  MAX_A0_E0_LIVE_IMPORT_REPLACEMENT_PREPARATIONS,
} from "../../src/application/application-interchange-owner-contract";
import type { AppState } from "../../src/application/application-state-contract";
import {
  A0_E0_BRIDGE_OWNER_OPERATION_NAMES,
  A0_E0_BRIDGE_SPEC_BYTE_DIGESTS,
  A0_E0_BRIDGE_SPEC_FILES,
  validateA0E0BridgeContract,
} from "../../scripts/validate-a0-e0-bridge-contract";

type Assert<Value extends true> = Value;
type Equal<Left, Right> = [Left] extends [Right]
  ? [Right] extends [Left]
    ? true
    : false
  : false;
type IsPromise<Value> = Value extends Promise<unknown> ? true : false;
type ForbiddenStateKey =
  "currentState" | "lastKnownState" | "observedBefore" | "state";
type ContainsForbiddenStateKey<Value> = Value extends (
  ...args: never[]
) => unknown
  ? false
  : Value extends readonly (infer Item)[]
    ? ContainsForbiddenStateKey<Item>
    : Value extends object
      ? Extract<keyof Value, ForbiddenStateKey> extends never
        ? true extends {
            [Key in keyof Value]-?: ContainsForbiddenStateKey<Value[Key]>;
          }[keyof Value]
          ? true
          : false
        : true
      : false;
type ContainsAppState<Value> = Value extends AppState
  ? true
  : Value extends (...args: never[]) => unknown
    ? false
    : Value extends readonly (infer Item)[]
      ? ContainsAppState<Item>
      : Value extends object
        ? true extends {
            [Key in keyof Value]-?: ContainsAppState<Value[Key]>;
          }[keyof Value]
          ? true
          : false
        : false;

type OwnerOperationName =
  | "prepareImportReplacementPublication"
  | "discardImportReplacementPublication"
  | "publishImportReplacement"
  | "readCurrentApplicationDocumentIdentity"
  | "publishCanonicalExportRevision";
type OwnerOperationKeysAreExact = Assert<
  Equal<keyof A0E0InterchangeOwnerOperations, OwnerOperationName>
>;
type OwnerPortKeysAreExact = Assert<
  Equal<keyof A0E0InterchangeOwnerPorts, OwnerOperationName>
>;
type ProducerAggregateNarrowsToConsumerAggregate = Assert<
  A0E0InterchangeOwnerOperations extends A0E0InterchangeOwnerPorts
    ? true
    : false
>;
type ConsumerAggregateCannotStandInForProducerAggregate = Assert<
  A0E0InterchangeOwnerPorts extends A0E0InterchangeOwnerOperations
    ? false
    : true
>;
type EachProducerNarrowsToItsConsumerPort = Assert<
  Equal<
    [
      PrepareImportReplacementPublicationOperation extends PrepareImportReplacementPublicationPort
        ? true
        : false,
      DiscardImportReplacementPublicationOperation extends DiscardImportReplacementPublicationPort
        ? true
        : false,
      PublishImportReplacementOperation extends PublishImportReplacementPort
        ? true
        : false,
      ReadCurrentApplicationDocumentIdentityOperation extends ReadCurrentApplicationDocumentIdentityPort
        ? true
        : false,
      PublishCanonicalExportRevisionOperation extends PublishCanonicalExportRevisionPort
        ? true
        : false,
    ],
    [true, true, true, true, true]
  >
>;
type ConsumerPortsDoNotWidenIntoProducersExceptExactCleanup = Assert<
  Equal<
    [
      PrepareImportReplacementPublicationPort extends PrepareImportReplacementPublicationOperation
        ? true
        : false,
      DiscardImportReplacementPublicationPort extends DiscardImportReplacementPublicationOperation
        ? true
        : false,
      PublishImportReplacementPort extends PublishImportReplacementOperation
        ? true
        : false,
      ReadCurrentApplicationDocumentIdentityPort extends ReadCurrentApplicationDocumentIdentityOperation
        ? true
        : false,
      PublishCanonicalExportRevisionPort extends PublishCanonicalExportRevisionOperation
        ? true
        : false,
    ],
    [false, true, false, false, false]
  >
>;
type PreparationProducerIsExact = Assert<
  Equal<
    ReturnType<PrepareImportReplacementPublicationOperation>,
    PrepareImportReplacementPublicationResult
  >
>;
type PreparationConsumerIsUnknown = Assert<
  Equal<ReturnType<PrepareImportReplacementPublicationPort>, unknown>
>;
type PreparationRequestHasNoCallerState = Assert<
  Equal<
    Extract<
      keyof PrepareImportReplacementPublicationRequest,
      "state" | "currentState"
    >,
    never
  >
>;
type CleanupProducerAndConsumerAreExact = Assert<
  Equal<
    DiscardImportReplacementPublicationOperation,
    DiscardImportReplacementPublicationPort
  >
>;
type CleanupReturnsTypedTotalReceipt = Assert<
  Equal<
    ReturnType<DiscardImportReplacementPublicationPort>,
    DiscardImportReplacementPublicationResult
  >
>;
type PublicationProducerIsExact = Assert<
  Equal<
    ReturnType<PublishImportReplacementOperation>,
    PublishImportReplacementResult
  >
>;
type PublicationConsumerIsUnknown = Assert<
  Equal<ReturnType<PublishImportReplacementPort>, unknown>
>;
type LatestIdentityProducerIsExact = Assert<
  Equal<
    ReturnType<ReadCurrentApplicationDocumentIdentityOperation>,
    ApplicationDocumentIdentity
  >
>;
type LatestIdentityConsumerIsUnknown = Assert<
  Equal<ReturnType<ReadCurrentApplicationDocumentIdentityPort>, unknown>
>;
type MarkerProducerIsExact = Assert<
  Equal<
    ReturnType<PublishCanonicalExportRevisionOperation>,
    PublishCanonicalExportRevisionResult
  >
>;
type MarkerConsumerIsUnknown = Assert<
  Equal<ReturnType<PublishCanonicalExportRevisionPort>, unknown>
>;
type EveryProducerOperationIsSynchronous = Assert<
  Equal<
    [
      IsPromise<ReturnType<PrepareImportReplacementPublicationOperation>>,
      IsPromise<ReturnType<DiscardImportReplacementPublicationOperation>>,
      IsPromise<ReturnType<PublishImportReplacementOperation>>,
      IsPromise<ReturnType<ReadCurrentApplicationDocumentIdentityOperation>>,
      IsPromise<ReturnType<PublishCanonicalExportRevisionOperation>>,
    ],
    [false, false, false, false, false]
  >
>;
type EveryOwnerRequestResultHandoffAndIdentityIsStateFree = Assert<
  Equal<
    [
      ContainsAppState<ImportReplacementSourceIdentity>,
      ContainsAppState<ImportRequestIdentity>,
      ContainsAppState<ApplicationDocumentIdentity>,
      ContainsAppState<PrepareImportReplacementPublicationRequest>,
      ContainsAppState<PrepareImportReplacementPublicationResult>,
      ContainsAppState<DiscardImportReplacementPublicationRequest>,
      ContainsAppState<DiscardImportReplacementPublicationResult>,
      ContainsAppState<ImportReplacementHandoff>,
      ContainsAppState<PublishImportReplacementResult>,
      ContainsAppState<PublishCanonicalExportRevisionRequest>,
      ContainsAppState<PublishCanonicalExportRevisionResult>,
    ],
    [
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]
  >
>;
type EveryOwnerRequestResultHandoffAndIdentityOmitsStateKeys = Assert<
  Equal<
    [
      ContainsForbiddenStateKey<ImportReplacementSourceIdentity>,
      ContainsForbiddenStateKey<ImportRequestIdentity>,
      ContainsForbiddenStateKey<ApplicationDocumentIdentity>,
      ContainsForbiddenStateKey<PrepareImportReplacementPublicationRequest>,
      ContainsForbiddenStateKey<PrepareImportReplacementPublicationResult>,
      ContainsForbiddenStateKey<DiscardImportReplacementPublicationRequest>,
      ContainsForbiddenStateKey<DiscardImportReplacementPublicationResult>,
      ContainsForbiddenStateKey<ImportReplacementHandoff>,
      ContainsForbiddenStateKey<PublishImportReplacementResult>,
      ContainsForbiddenStateKey<PublishCanonicalExportRevisionRequest>,
      ContainsForbiddenStateKey<PublishCanonicalExportRevisionResult>,
    ],
    [
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]
  >
>;
type EveryOperationParameterAndResultIsStateFree = Assert<
  Equal<
    [
      ContainsAppState<
        Parameters<PrepareImportReplacementPublicationOperation>[0]
      >,
      ContainsAppState<
        ReturnType<PrepareImportReplacementPublicationOperation>
      >,
      ContainsAppState<
        Parameters<DiscardImportReplacementPublicationOperation>[0]
      >,
      ContainsAppState<
        ReturnType<DiscardImportReplacementPublicationOperation>
      >,
      ContainsAppState<Parameters<PublishImportReplacementOperation>[0]>,
      ContainsAppState<ReturnType<PublishImportReplacementOperation>>,
      ContainsAppState<
        ReturnType<ReadCurrentApplicationDocumentIdentityOperation>
      >,
      ContainsAppState<Parameters<PublishCanonicalExportRevisionOperation>[0]>,
      ContainsAppState<ReturnType<PublishCanonicalExportRevisionOperation>>,
    ],
    [false, false, false, false, false, false, false, false, false]
  >
>;
type RecursiveStateDetectorCatchesStateUnderArbitraryNames = Assert<
  Equal<
    ContainsAppState<
      Readonly<{ payload: Readonly<{ authoritySnapshot: AppState }> }>
    >,
    true
  >
>;

// Keep all compile-only assertions live under isolatedModules.
const typeAssertions: readonly true[] = [
  true satisfies OwnerOperationKeysAreExact,
  true satisfies OwnerPortKeysAreExact,
  true satisfies ProducerAggregateNarrowsToConsumerAggregate,
  true satisfies ConsumerAggregateCannotStandInForProducerAggregate,
  true satisfies EachProducerNarrowsToItsConsumerPort,
  true satisfies ConsumerPortsDoNotWidenIntoProducersExceptExactCleanup,
  true satisfies PreparationProducerIsExact,
  true satisfies PreparationConsumerIsUnknown,
  true satisfies PreparationRequestHasNoCallerState,
  true satisfies CleanupProducerAndConsumerAreExact,
  true satisfies CleanupReturnsTypedTotalReceipt,
  true satisfies PublicationProducerIsExact,
  true satisfies PublicationConsumerIsUnknown,
  true satisfies LatestIdentityProducerIsExact,
  true satisfies LatestIdentityConsumerIsUnknown,
  true satisfies MarkerProducerIsExact,
  true satisfies MarkerConsumerIsUnknown,
  true satisfies EveryProducerOperationIsSynchronous,
  true satisfies EveryOwnerRequestResultHandoffAndIdentityIsStateFree,
  true satisfies EveryOwnerRequestResultHandoffAndIdentityOmitsStateKeys,
  true satisfies EveryOperationParameterAndResultIsStateFree,
  true satisfies RecursiveStateDetectorCatchesStateUnderArbitraryNames,
];
void typeAssertions;

const repositoryRoot = dirname(
  dirname(dirname(fileURLToPath(import.meta.url))),
);
const fixtureRoot = join(repositoryRoot, "tests/fixtures/a0-e0-bridge");
const ownerContractPath = join(
  repositoryRoot,
  "src/application/application-interchange-owner-contract.ts",
);
const e0ContractPath = join(
  repositoryRoot,
  "src/application/e0-interchange-contract.ts",
);

function sha256(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function propertyName(node: ts.PropertyName): string | null {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return null;
}

type OwnerRunClassification = Readonly<{
  id: string;
  ownerProof: boolean;
  e0V2Owned: boolean;
  rawCall: Readonly<{ target: string; operation: string }>;
}>;

type OwnerCaseClassification = Readonly<{
  id: string;
  operation: string;
  ownerProof: boolean;
  e0V2Owned: boolean;
  runs: readonly OwnerRunClassification[];
}>;

type JsonObject = Record<string, unknown>;

type ModuleEdgeKind =
  | "import-declaration"
  | "export-declaration"
  | "import-equals"
  | "import-type"
  | "dynamic-import"
  | "require-call";

type ModuleEdge = Readonly<{
  kind: ModuleEdgeKind;
  specifier: string;
}>;

type ImportDescriptor = Readonly<{
  modulePath: string;
  isTypeOnly: boolean;
  defaultImport: string | null;
  namedBindingKind: "none" | "named-imports" | "namespace-import";
  elements: readonly Readonly<{
    importedName: string;
    localName: string;
    isTypeOnly: boolean;
  }>[];
  hasImportAttributes: boolean;
}>;

type ModuleDirectiveDescriptor = Readonly<{
  referencedFiles: readonly string[];
  typeReferenceDirectives: readonly string[];
  libReferenceDirectives: readonly string[];
  amdDependencies: readonly Readonly<{
    name: string | undefined;
    path: string;
  }>[];
}>;

function namedImportNames(node: ts.ImportDeclaration): string[] {
  const bindings = node.importClause?.namedBindings;
  if (bindings === undefined || !ts.isNamedImports(bindings)) return [];
  return bindings.elements.map((element) => element.name.text);
}

function describeImport(
  node: ts.ImportDeclaration,
  sourceFile: ts.SourceFile,
): ImportDescriptor {
  const bindings = node.importClause?.namedBindings;
  return {
    modulePath: moduleSpecifierText(node.moduleSpecifier, sourceFile),
    isTypeOnly: node.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword,
    defaultImport: node.importClause?.name?.text ?? null,
    namedBindingKind:
      bindings === undefined
        ? "none"
        : ts.isNamedImports(bindings)
          ? "named-imports"
          : "namespace-import",
    elements:
      bindings !== undefined && ts.isNamedImports(bindings)
        ? bindings.elements.map((element) => ({
            importedName: (element.propertyName ?? element.name).text,
            localName: element.name.text,
            isTypeOnly: element.isTypeOnly,
          }))
        : [],
    hasImportAttributes: node.attributes !== undefined,
  };
}

function describeModuleDirectives(
  source: string,
  sourceFile: ts.SourceFile,
): ModuleDirectiveDescriptor {
  const preprocessed = ts.preProcessFile(source, true, true);
  return {
    referencedFiles: preprocessed.referencedFiles.map(
      (entry) => entry.fileName,
    ),
    typeReferenceDirectives: preprocessed.typeReferenceDirectives.map(
      (entry) => entry.fileName,
    ),
    libReferenceDirectives: preprocessed.libReferenceDirectives.map(
      (entry) => entry.fileName,
    ),
    // TypeScript 6 no longer exposes AMD dependencies from preProcessFile;
    // createSourceFile records the same leading directive in this exact list.
    amdDependencies: sourceFile.amdDependencies.map((entry) => ({
      name: entry.name,
      path: entry.path,
    })),
  };
}

function moduleSpecifierText(
  node: ts.Node | undefined,
  sourceFile: ts.SourceFile,
): string {
  if (node === undefined) return "<missing>";
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isLiteralTypeNode(node)) {
    return moduleSpecifierText(node.literal, sourceFile);
  }
  return node.getText(sourceFile);
}

function collectModuleEdges(sourceFile: ts.SourceFile): ModuleEdge[] {
  const edges: ModuleEdge[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      edges.push({
        kind: "import-declaration",
        specifier: moduleSpecifierText(node.moduleSpecifier, sourceFile),
      });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined
    ) {
      edges.push({
        kind: "export-declaration",
        specifier: moduleSpecifierText(node.moduleSpecifier, sourceFile),
      });
    } else if (ts.isImportEqualsDeclaration(node)) {
      const moduleReference = node.moduleReference;
      edges.push({
        kind: "import-equals",
        specifier: ts.isExternalModuleReference(moduleReference)
          ? moduleSpecifierText(moduleReference.expression, sourceFile)
          : moduleSpecifierText(moduleReference, sourceFile),
      });
    } else if (ts.isImportTypeNode(node)) {
      edges.push({
        kind: "import-type",
        specifier: moduleSpecifierText(node.argument, sourceFile),
      });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      edges.push({
        kind: "dynamic-import",
        specifier: moduleSpecifierText(node.arguments[0], sourceFile),
      });
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require"
    ) {
      edges.push({
        kind: "require-call",
        specifier: moduleSpecifierText(node.arguments[0], sourceFile),
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return edges;
}

function jsonObject(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`BRIDGE_TEST_EXPECTED_OBJECT:${label}`);
  }
  return value as JsonObject;
}

describe("A0/E0 owner bridge specification", () => {
  test(
    "independent packet, accepted E0 preservation, and cross-links validate",
    async () => {
      const report = await validateA0E0BridgeContract();
      expect(report).toEqual({
        schema: "changes.validation.a0-e0-bridge-contract.v2",
        package: "A0 interchange owner ports",
        outcome: "pass",
        reviewState: "proposed-independent-spec",
        counts: {
          files: 5,
          replacementCases: 28,
          identityCases: 4,
          markerCases: 10,
          applicabilityRows: 5,
          mutationControls: 32,
          traces: 5,
          authorities: 5,
        },
        acceptedE0V1PinnedUnmodified: true,
        semanticCompatibilityClaim: false,
        productionImplementationClaim: false,
        humanAcceptanceClaim: false,
        findings: [],
      });
    },
    { timeout: 300_000, retry: 0 },
  );

  test("literal packet contains only A0 owner proof", async () => {
    const cases = JSON.parse(
      await readFile(join(fixtureRoot, "owner-port-cases.json"), "utf8"),
    ) as {
      replacementCases: OwnerCaseClassification[];
      identityCases: OwnerCaseClassification[];
      markerCases: OwnerCaseClassification[];
    };
    expect({
      replacementCases: cases.replacementCases.length,
      identityCases: cases.identityCases.length,
      markerCases: cases.markerCases.length,
    }).toEqual({ replacementCases: 28, identityCases: 4, markerCases: 10 });
    const packetCases = [
      ...cases.replacementCases,
      ...cases.identityCases,
      ...cases.markerCases,
    ];
    const runs = [
      ...cases.replacementCases.flatMap((entry) => entry.runs),
      ...cases.identityCases.flatMap((entry) => entry.runs),
      ...cases.markerCases.flatMap((entry) => entry.runs),
    ];
    const removedCaseIds = new Set([
      "BRIDGE-REP-025",
      "BRIDGE-REP-026",
      "BRIDGE-ID-005",
      "BRIDGE-ID-006",
      "BRIDGE-MARK-006",
      "BRIDGE-MARK-007",
    ]);

    expect({
      total: runs.length,
      nonOwnerCases: packetCases
        .filter((entry) => !entry.ownerProof)
        .map((entry) => entry.id),
      e0V2OwnedCases: packetCases
        .filter((entry) => entry.e0V2Owned)
        .map((entry) => entry.id),
      nonOwnerRunCount: runs.filter((run) => !run.ownerProof).length,
      e0V2OwnedRunCount: runs.filter((run) => run.e0V2Owned).length,
      e0V2NormalizerTargetCount: runs.filter(
        (run) => run.rawCall.target === "E0V2ConsumerNormalizer",
      ).length,
      removedCaseIdsPresent: packetCases
        .map((entry) => entry.id)
        .filter((id) => removedCaseIds.has(id)),
    }).toEqual({
      total: 118,
      nonOwnerCases: [],
      e0V2OwnedCases: [],
      nonOwnerRunCount: 0,
      e0V2OwnedRunCount: 0,
      e0V2NormalizerTargetCount: 0,
      removedCaseIdsPresent: [],
    });

    const unrelatedRequestDrift = cases.replacementCases
      .find((entry) => entry.id === "BRIDGE-REP-030")
      ?.runs.find((run) => run.id === "same-revision-unrelated-request-added");
    expect(unrelatedRequestDrift).toMatchObject({
      ownerProof: true,
      e0V2Owned: false,
      rawCall: {
        target: "A0E0InterchangeOwnerOperations",
        operation: "publishImportReplacement",
      },
    });
  });

  test("all five bridge fixture bytes match the independent pins", async () => {
    for (const filename of A0_E0_BRIDGE_SPEC_FILES) {
      const source = await readFile(join(fixtureRoot, filename), "utf8");
      const expectedDigest = A0_E0_BRIDGE_SPEC_BYTE_DIGESTS[filename];
      if (expectedDigest === undefined) {
        throw new Error(`BRIDGE_TEST_DIGEST_MISSING:${filename}`);
      }
      expect(sha256(source)).toBe(expectedDigest);
    }
  });

  test(
    "semantic lock rejects owner-result and invalid-AppState tampers after its byte pin is refreshed",
    async () => {
      const temporaryRoot = await mkdtemp(join(tmpdir(), "jcpe-a0-e0-bridge-"));
      try {
        await cp(fixtureRoot, temporaryRoot, { recursive: true });
        const casesPath = join(temporaryRoot, "owner-port-cases.json");
        const cases = JSON.parse(await readFile(casesPath, "utf8")) as {
          replacementCases: Array<{
            id: string;
            runs: Array<{
              id: string;
              exactTypedResult: { value: { liveForRequest: number } };
              controllerStateBefore: {
                patches: Array<Record<string, unknown>>;
              };
            }>;
          }>;
        };
        const publishCase = cases.replacementCases.find(
          (candidate) => candidate.id === "BRIDGE-REP-029",
        );
        const retainedRun = publishCase?.runs.find(
          (candidate) => candidate.id === "retained",
        );
        if (retainedRun === undefined) {
          throw new Error("BRIDGE_TEST_RETAINED_RUN_MISSING");
        }
        retainedRun.exactTypedResult.value.liveForRequest = 1;
        const manualSourceRun = publishCase?.runs.find(
          (candidate) => candidate.id === "manual-source-c",
        );
        if (manualSourceRun === undefined) {
          throw new Error("BRIDGE_TEST_MANUAL_SOURCE_RUN_MISSING");
        }
        manualSourceRun.controllerStateBefore.patches.push({
          op: "replace",
          jsonPointer: "/pendingRequests/0/status",
          from: "running",
          to: "completed",
          value: "completed",
        });
        const changedSource = `${JSON.stringify(cases, null, 2)}\n`;
        await writeFile(casesPath, changedSource, "utf8");
        const refreshedPins = {
          ...A0_E0_BRIDGE_SPEC_BYTE_DIGESTS,
          "owner-port-cases.json": sha256(changedSource),
        };
        const report = await validateA0E0BridgeContract(temporaryRoot, {
          expectedByteDigests: refreshedPins,
        });
        expect(report.outcome).toBe("fail");
        expect(report.findings.map((finding) => finding.code)).toContain(
          "BRIDGE_SEMANTIC_DIGEST",
        );
        expect(report.findings.map((finding) => finding.code)).toContain(
          "BRIDGE_LITERAL_RUN",
        );
        const invalidStateFinding = report.findings.find(
          (finding) =>
            finding.code === "BRIDGE_LITERAL_RUN" &&
            finding.path ===
              "owner-port-cases.json.BRIDGE-REP-029/manual-source-c",
        );
        if (invalidStateFinding === undefined) {
          throw new Error("BRIDGE_TEST_INVALID_STATE_FINDING_MISSING");
        }
        expect(invalidStateFinding.message).toContain("BRIDGE_RUN_APP_STATE");
        expect(report.findings.map((finding) => finding.code)).not.toContain(
          "BRIDGE_BYTE_DIGEST",
        );
      } finally {
        await rm(temporaryRoot, { recursive: true, force: true });
      }
    },
    { timeout: 300_000, retry: 0 },
  );

  test("source policy constants agree exactly with their root fixture authority", async () => {
    const contract = jsonObject(
      JSON.parse(
        await readFile(join(fixtureRoot, "a0-e0-bridge-contract.json"), "utf8"),
      ),
      "root",
    );

    expect(contract["operationNames"]).toEqual([
      ...A0_E0_INTERCHANGE_OWNER_OPERATION_NAMES,
    ]);
    expect(contract["operationNames"]).toEqual([
      ...A0_E0_BRIDGE_OWNER_OPERATION_NAMES,
    ]);
    expect(contract["lawIds"]).toEqual([...A0_E0_INTERCHANGE_OWNER_LAW_IDS]);
    expect(contract["sourceOriginMapping"]).toEqual(
      IMPORT_REPLACEMENT_ORIGIN_BY_SOURCE_FORMAT,
    );
    expect(contract["coverageFamilies"]).toEqual([
      "positive",
      "negative-near-miss",
      "stale-concurrent",
      "malformed-owner-input",
      "replay",
      "transposition-applicability",
      "mutation",
    ]);
    const proofRequirements = jsonObject(
      contract["proofRequirements"],
      "proofRequirements",
    );
    expect(proofRequirements["forwardE0V2BehaviorRowsPresent"]).toBe(false);
    expect(proofRequirements["futureE0V2BehaviorDeferredTo"]).toBe(
      "jcpe-milestone-reliable-studio-l3a.8.4",
    );

    const requestAuthority = jsonObject(
      contract["requestAuthorityBoundary"],
      "requestAuthorityBoundary",
    );
    const { deferredBindingLeaf, ...rootRequestAuthorityPolicy } =
      requestAuthority;
    expect(deferredBindingLeaf).toBe("jcpe-milestone-reliable-studio-l3a.8.4");
    expect(rootRequestAuthorityPolicy).toEqual(
      A0_E0_INTERCHANGE_OWNER_REQUEST_AUTHORITY_BOUNDARY,
    );
    expect(contract["replacementPreparationValidation"]).toEqual(
      IMPORT_REPLACEMENT_PREPARATION_VALIDATION_POLICY,
    );

    const registry = jsonObject(
      contract["replacementRegistry"],
      "replacementRegistry",
    );
    expect(registry["maximumLiveEntries"]).toBe(
      MAX_A0_E0_LIVE_IMPORT_REPLACEMENT_PREPARATIONS,
    );

    const publicationMerge = jsonObject(
      contract["replacementPublicationMerge"],
      "replacementPublicationMerge",
    );
    expect(publicationMerge["allAppStateFieldsPartitionedExactlyOnce"]).toBe(
      true,
    );
    expect(publicationMerge).toEqual(
      IMPORT_REPLACEMENT_PUBLICATION_LATEST_STATE_MERGE,
    );
  });

  test("module-edge detector covers every forbidden TypeScript module syntax recursively", () => {
    const syntheticSource = ts.createSourceFile(
      "synthetic-module-edges.ts",
      `
        import type { Ordinary } from "./ordinary";
        export { named } from "./named-reexport";
        export * from "./star-reexport";
        import legacy = require("./import-equals");
        function nestedEdges(): unknown {
          type Deferred = import("./import-type").Deferred;
          void import("./dynamic-import");
          return require("./require-call") as Deferred;
        }
        void legacy;
        void nestedEdges;
      `,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    expect(collectModuleEdges(syntheticSource)).toEqual([
      { kind: "import-declaration", specifier: "./ordinary" },
      { kind: "export-declaration", specifier: "./named-reexport" },
      { kind: "export-declaration", specifier: "./star-reexport" },
      { kind: "import-equals", specifier: "./import-equals" },
      { kind: "import-type", specifier: "./import-type" },
      { kind: "dynamic-import", specifier: "./dynamic-import" },
      { kind: "require-call", specifier: "./require-call" },
    ]);
  });

  test("import descriptor exposes default, alias, element type, and attribute bypasses", () => {
    const syntheticSource = ts.createSourceFile(
      "synthetic-import-bindings.ts",
      `
        import DefaultBinding, {
          Evil as AllowedLocal,
          type TypeEvil as TypeAllowed,
        } from "./dependency" with { type: "json" };
      `,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const imports = syntheticSource.statements.filter(ts.isImportDeclaration);

    expect(imports).toHaveLength(1);
    const [importDeclaration] = imports;
    if (importDeclaration === undefined) {
      throw new Error("BRIDGE_TEST_IMPORT_DECLARATION_MISSING");
    }
    expect(describeImport(importDeclaration, syntheticSource)).toEqual({
      modulePath: "./dependency",
      isTypeOnly: false,
      defaultImport: "DefaultBinding",
      namedBindingKind: "named-imports",
      elements: [
        {
          importedName: "Evil",
          localName: "AllowedLocal",
          isTypeOnly: false,
        },
        {
          importedName: "TypeEvil",
          localName: "TypeAllowed",
          isTypeOnly: true,
        },
      ],
      hasImportAttributes: true,
    });
  });

  test("module directive descriptor exposes path, types, lib, and AMD dependencies", () => {
    const source = `
/// <reference path="./reference-path.ts" />
/// <reference types="synthetic-types" />
/// <reference lib="es2024" />
/// <amd-dependency path="./amd-dependency" name="synthetic-amd" />
`;
    const syntheticSource = ts.createSourceFile(
      "synthetic-module-directives.ts",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    expect(describeModuleDirectives(source, syntheticSource)).toEqual({
      referencedFiles: ["./reference-path.ts"],
      typeReferenceDirectives: ["synthetic-types"],
      libReferenceDirectives: ["es2024"],
      amdDependencies: [{ name: "synthetic-amd", path: "./amd-dependency" }],
    });
  });

  test("owner module has a cycle-free import topology and exact producer/consumer aggregates", async () => {
    const source = await readFile(ownerContractPath, "utf8");
    const sourceFile = ts.createSourceFile(
      ownerContractPath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    expect(describeModuleDirectives(source, sourceFile)).toEqual({
      referencedFiles: [],
      typeReferenceDirectives: [],
      libReferenceDirectives: [],
      amdDependencies: [],
    });
    const imports = sourceFile.statements.filter(ts.isImportDeclaration);
    expect(collectModuleEdges(sourceFile)).toEqual([
      { kind: "import-declaration", specifier: "../domain" },
      {
        kind: "import-declaration",
        specifier: "./application-state-contract",
      },
      {
        kind: "import-declaration",
        specifier: "./application-state-contract",
      },
    ]);
    expect(imports.map((node) => describeImport(node, sourceFile))).toEqual([
      {
        modulePath: "../domain",
        isTypeOnly: true,
        defaultImport: null,
        namedBindingKind: "named-imports",
        elements: ["DocumentId", "ValidatedDocument"].map((name) => ({
          importedName: name,
          localName: name,
          isTypeOnly: false,
        })),
        hasImportAttributes: false,
      },
      {
        modulePath: "./application-state-contract",
        isTypeOnly: false,
        defaultImport: null,
        namedBindingKind: "named-imports",
        elements: [
          "MAX_APPLICATION_SEQUENCE",
          "MAX_COMMAND_ID_CODE_POINTS",
          "MAX_COMMAND_LABEL_CODE_POINTS",
        ].map((name) => ({
          importedName: name,
          localName: name,
          isTypeOnly: false,
        })),
        hasImportAttributes: false,
      },
      {
        modulePath: "./application-state-contract",
        isTypeOnly: true,
        defaultImport: null,
        namedBindingKind: "named-imports",
        elements: [
          "AppRevision",
          "ApplicationEffect",
          "ApplicationReplacementOrigin",
          "ApplicationRequestId",
          "ApplicationWorkCounters",
          "CommandId",
          "DocumentTransitionState",
          "ReplacementRetirementReceipt",
          "TransportGeneration",
        ].map((name) => ({
          importedName: name,
          localName: name,
          isTypeOnly: false,
        })),
        hasImportAttributes: false,
      },
    ]);
    expect(imports.flatMap(namedImportNames)).not.toContain("AppState");
    expect(
      imports
        .filter(
          (node) =>
            node.importClause?.phaseModifier !== ts.SyntaxKind.TypeKeyword,
        )
        .flatMap(namedImportNames),
    ).toEqual([
      "MAX_APPLICATION_SEQUENCE",
      "MAX_COMMAND_ID_CODE_POINTS",
      "MAX_COMMAND_LABEL_CODE_POINTS",
    ]);
    expect(source).not.toContain("e0-interchange-contract");
    expect(
      sourceFile.statements.some(
        (node) => ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node),
      ),
    ).toBe(false);

    const aggregateInterfaces = new Map(
      sourceFile.statements
        .filter(ts.isInterfaceDeclaration)
        .filter((node) =>
          [
            "A0E0InterchangeOwnerOperations",
            "A0E0InterchangeOwnerPorts",
          ].includes(node.name.text),
        )
        .map((node) => [node.name.text, node]),
    );
    expect([...aggregateInterfaces.keys()]).toEqual([
      "A0E0InterchangeOwnerOperations",
      "A0E0InterchangeOwnerPorts",
    ]);
    const expectedOperationNames = [...A0_E0_BRIDGE_OWNER_OPERATION_NAMES];
    for (const aggregate of aggregateInterfaces.values()) {
      const memberNames = aggregate.members.map((member) =>
        member.name === undefined ? null : propertyName(member.name),
      );
      expect(memberNames).not.toContain(null);
      expect(memberNames).toEqual(expectedOperationNames);
    }
    const producerTypes = aggregateInterfaces
      .get("A0E0InterchangeOwnerOperations")
      ?.members.map((member) =>
        ts.isPropertySignature(member)
          ? (member.type?.getText(sourceFile) ?? null)
          : null,
      );
    const consumerTypes = aggregateInterfaces
      .get("A0E0InterchangeOwnerPorts")
      ?.members.map((member) =>
        ts.isPropertySignature(member)
          ? (member.type?.getText(sourceFile) ?? null)
          : null,
      );
    expect(producerTypes).toEqual([
      "PrepareImportReplacementPublicationOperation",
      "DiscardImportReplacementPublicationOperation",
      "PublishImportReplacementOperation",
      "ReadCurrentApplicationDocumentIdentityOperation",
      "PublishCanonicalExportRevisionOperation",
    ]);
    expect(consumerTypes).toEqual([
      "PrepareImportReplacementPublicationPort",
      "DiscardImportReplacementPublicationPort",
      "PublishImportReplacementPort",
      "ReadCurrentApplicationDocumentIdentityPort",
      "PublishCanonicalExportRevisionPort",
    ]);
  });

  test("accepted E0 v1 remains an immutable, unbound archival authority", async () => {
    const source = await readFile(e0ContractPath, "utf8");
    const sourceFile = ts.createSourceFile(
      e0ContractPath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const importsOwner = sourceFile.statements.some(
      (node) =>
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text ===
          "./application-interchange-owner-contract",
    );
    expect(importsOwner).toBe(false);
    expect(sha256(source)).toBe(
      "32a51ef9eac0948a069fc3498348562f70e7703b430f9e1ad9c9961fe53cf10a",
    );
    expect(source).toContain("type CommitImportReplacementRequestBase");
    expect(source).toContain("observedBefore: AppState");
  });
});
