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
  ownerProof: boolean;
  e0V2Owned: boolean;
}>;

type JsonObject = Record<string, unknown>;

function namedImportNames(node: ts.ImportDeclaration): string[] {
  const bindings = node.importClause?.namedBindings;
  if (bindings === undefined || !ts.isNamedImports(bindings)) return [];
  return bindings.elements.map((element) => element.name.text);
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
          replacementCases: 30,
          identityCases: 6,
          markerCases: 12,
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

  test("literal run inventory separates owner proof from forward E0-v2 rows", async () => {
    const cases = JSON.parse(
      await readFile(join(fixtureRoot, "owner-port-cases.json"), "utf8"),
    ) as {
      replacementCases: Array<{ runs: OwnerRunClassification[] }>;
      identityCases: Array<{ runs: OwnerRunClassification[] }>;
      markerCases: Array<{ runs: OwnerRunClassification[] }>;
    };
    const runs = [
      ...cases.replacementCases.flatMap((entry) => entry.runs),
      ...cases.identityCases.flatMap((entry) => entry.runs),
      ...cases.markerCases.flatMap((entry) => entry.runs),
    ];
    const ownerRuns = runs.filter((run) => run.ownerProof && !run.e0V2Owned);
    const forwardRuns = runs.filter((run) => !run.ownerProof && run.e0V2Owned);

    expect({
      total: runs.length,
      owner: ownerRuns.length,
      forwardE0V2: forwardRuns.length,
      misclassified: runs.length - ownerRuns.length - forwardRuns.length,
    }).toEqual({ total: 121, owner: 115, forwardE0V2: 6, misclassified: 0 });
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
    "semantic lock rejects a literal owner-result tamper after its byte pin is refreshed",
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
    const {
      allAppStateFieldsPartitionedExactlyOnce,
      ...rootPublicationMergePolicy
    } = publicationMerge;
    expect(allAppStateFieldsPartitionedExactlyOnce).toBe(true);
    expect(rootPublicationMergePolicy).toEqual(
      IMPORT_REPLACEMENT_PUBLICATION_LATEST_STATE_MERGE,
    );
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
    const imports = sourceFile.statements.filter(ts.isImportDeclaration);
    expect(
      imports.map((node) => ({
        module: (node.moduleSpecifier as ts.StringLiteral).text,
        kind:
          node.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword
            ? "type"
            : "runtime",
        names: namedImportNames(node),
      })),
    ).toEqual([
      {
        module: "../domain",
        kind: "type",
        names: ["DocumentId", "ValidatedDocument"],
      },
      {
        module: "./application-state-contract",
        kind: "runtime",
        names: [
          "MAX_APPLICATION_SEQUENCE",
          "MAX_COMMAND_ID_CODE_POINTS",
          "MAX_COMMAND_LABEL_CODE_POINTS",
        ],
      },
      {
        module: "./application-state-contract",
        kind: "type",
        names: [
          "AppRevision",
          "ApplicationEffect",
          "ApplicationReplacementOrigin",
          "ApplicationRequestId",
          "ApplicationWorkCounters",
          "CommandId",
          "DocumentTransitionState",
          "ReplacementRetirementReceipt",
          "TransportGeneration",
        ],
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
      ?.members.map((member) => member.type?.getText(sourceFile));
    const consumerTypes = aggregateInterfaces
      .get("A0E0InterchangeOwnerPorts")
      ?.members.map((member) => member.type?.getText(sourceFile));
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
