import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

import type {
  A0E0InterchangeOwnerPorts,
  ApplicationDocumentIdentity,
  DiscardImportReplacementPublicationOperation,
  DiscardImportReplacementPublicationPort,
  DiscardImportReplacementPublicationResult,
  PrepareImportReplacementPublicationOperation,
  PrepareImportReplacementPublicationPort,
  PrepareImportReplacementPublicationRequest,
  PrepareImportReplacementPublicationResult,
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
  | "currentState"
  | "lastKnownState"
  | "observedBefore"
  | "state";
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
type IsRecursivelyStateFree<Value> =
  true extends ContainsForbiddenStateKey<Value> ? false : true;

type OwnerPortKeysAreExact = Assert<
  Equal<
    keyof A0E0InterchangeOwnerPorts,
    | "prepareImportReplacementPublication"
    | "discardImportReplacementPublication"
    | "publishImportReplacement"
    | "readCurrentApplicationDocumentIdentity"
    | "publishCanonicalExportRevision"
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
type EveryOwnerPortIsSynchronous = Assert<
  Equal<
    [
      IsPromise<ReturnType<PrepareImportReplacementPublicationPort>>,
      IsPromise<ReturnType<DiscardImportReplacementPublicationPort>>,
      IsPromise<ReturnType<PublishImportReplacementPort>>,
      IsPromise<ReturnType<ReadCurrentApplicationDocumentIdentityPort>>,
      IsPromise<ReturnType<PublishCanonicalExportRevisionPort>>,
    ],
    [false, false, false, false, false]
  >
>;
type ImportPublicationResultIsStateFree = Assert<
  IsRecursivelyStateFree<PublishImportReplacementResult>
>;
type MarkerPublicationResultIsStateFree = Assert<
  IsRecursivelyStateFree<PublishCanonicalExportRevisionResult>
>;

// Keep all compile-only assertions live under isolatedModules.
const typeAssertions: readonly true[] = [
  true satisfies OwnerPortKeysAreExact,
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
  true satisfies EveryOwnerPortIsSynchronous,
  true satisfies ImportPublicationResultIsStateFree,
  true satisfies MarkerPublicationResultIsStateFree,
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

describe("A0/E0 owner bridge specification", () => {
  test("independent packet, accepted E0 preservation, and cross-links validate", async () => {
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
        mutationControls: 24,
        traces: 5,
        authorities: 5,
      },
      acceptedE0V1PinnedUnmodified: true,
      semanticCompatibilityClaim: false,
      productionImplementationClaim: false,
      humanAcceptanceClaim: false,
      findings: [],
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

  test("semantic lock still fails after a changed fixture receives a refreshed byte pin", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "jcpe-a0-e0-bridge-"));
    try {
      await cp(fixtureRoot, temporaryRoot, { recursive: true });
      const contractPath = join(temporaryRoot, "a0-e0-bridge-contract.json");
      const contract = JSON.parse(await readFile(contractPath, "utf8")) as {
        replacementRegistry: { maximumLiveEntries: number };
      };
      contract.replacementRegistry.maximumLiveEntries = 2;
      const changedSource = `${JSON.stringify(contract, null, 2)}\n`;
      await writeFile(contractPath, changedSource, "utf8");
      const refreshedPins = {
        ...A0_E0_BRIDGE_SPEC_BYTE_DIGESTS,
        "a0-e0-bridge-contract.json": sha256(changedSource),
      };
      const report = await validateA0E0BridgeContract(temporaryRoot, {
        expectedByteDigests: refreshedPins,
      });
      expect(report.outcome).toBe("fail");
      expect(report.findings.map((finding) => finding.code)).toContain(
        "BRIDGE_SEMANTIC_DIGEST",
      );
      expect(report.findings.map((finding) => finding.code)).toContain(
        "BRIDGE_REGISTRY",
      );
      expect(report.findings.map((finding) => finding.code)).not.toContain(
        "BRIDGE_BYTE_DIGEST",
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  test("owner module has a cycle-free type-only import topology and exact interface", async () => {
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
      imports.map((node) => (node.moduleSpecifier as ts.StringLiteral).text),
    ).toEqual(["../domain", "./application-state-contract"]);
    for (const node of imports) {
      expect(node.importClause?.phaseModifier).toBe(ts.SyntaxKind.TypeKeyword);
      const bindings = node.importClause?.namedBindings;
      if (bindings !== undefined && ts.isNamedImports(bindings)) {
        expect(
          bindings.elements.map((element) => element.name.text),
        ).not.toContain("AppState");
      }
    }
    expect(source).not.toContain("e0-interchange-contract");
    expect(
      sourceFile.statements.some(
        (node) => ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node),
      ),
    ).toBe(false);

    const ownerInterface = sourceFile.statements.find(
      (node): node is ts.InterfaceDeclaration =>
        ts.isInterfaceDeclaration(node) &&
        node.name.text === "A0E0InterchangeOwnerPorts",
    );
    expect(ownerInterface).toBeDefined();
    const memberNames = ownerInterface?.members.map((member) =>
      member.name === undefined ? null : propertyName(member.name),
    );
    expect(memberNames).not.toContain(null);
    expect(memberNames).toEqual([...A0_E0_BRIDGE_OWNER_OPERATION_NAMES]);
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
