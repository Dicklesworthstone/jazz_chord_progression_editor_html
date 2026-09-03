/**
 * E0 v2 preview + RES-03 projection conformance
 * (jcpe-milestone-reliable-studio-l3a.8.2 stage 4). The v2 preview
 * coordinator runs the REAL production pipeline — byte preflight, fatal
 * UTF-8 decode, lexical JSON routing, F2 decode, F3 semantic validation —
 * over the reviewed canonical-JSON golden, with the state-free
 * E0V2-RES-02 impact projection and an application-allocated command
 * seed. The resulting preview is then projected to the v2 commit request
 * per the frozen RES-03 table and driven through the production
 * transaction driver, closing the loop the fixture packet's RESCASE-003
 * pins: the projection travels into the owner request unchanged, and the
 * candidate crosses by reference, never re-decoded.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  buildChartDocumentCandidate,
  classifyJsonLexically,
  createPrepareImportPreviewCoordinatorV2,
  decodeUtf8Fatal,
  parseJsonData,
  projectPreviewToCommitRequestV2,
  validateDocumentSemantics,
  type ImportPayload,
  type ImportReplacementCommandSeed,
  type PrepareImportPreviewRequestV2,
  type RetireImportReplacementRequest,
  type X1ReplacementRetirementAdapter,
  createE0V2TransactionDriver,
} from "../../src/application";
import type { A0E0InterchangeOwnerPorts } from "../../src/application/application-interchange-owner-contract";
import {
  decodeDocumentShape,
  preflightDocumentImportBytes,
  type StableIdFactory,
  type StableIdFor,
  type StableIdKind,
} from "../../src/domain";
import { migrateLegacyJson } from "../../src/compatibility";
import {
  parseChartText,
  parseChordSymbol,
  resolveChord,
} from "../../src/theory";

const fixtureRoot = resolve(import.meta.dirname, "../fixtures/interchange");

function makeTestIdFactory(): StableIdFactory {
  const counters = new Map<string, number>();
  return {
    next: <K extends StableIdKind>(kind: K) => {
      const count = (counters.get(kind) ?? 0) + 1;
      counters.set(kind, count);
      return {
        ok: true as const,
        value: `${kind}-${String(count).padStart(4, "0")}` as StableIdFor<K>,
        source: "deterministic-test" as const,
      };
    },
  };
}

const RETAINED_PROJECTION = Object.freeze({
  historyEntryRetainedBytes: 4210,
  evictedUndoEntries: 0,
  redoEntriesCleared: 0,
  confirmationRequired: true,
  undoDisposition: "retained",
  undoEntriesAfterCommit: 3,
  undoRetainedBytesAfterCommit: 12630,
  exportRecommended: false,
} as const);

const COMMAND_SEED: ImportReplacementCommandSeed = Object.freeze({
  id: "command-v2-preview-1",
  label: "Import Changes",
  logicalTimeMs: 15000,
});

const IDENTITY = Object.freeze({
  requestId: 401,
  documentId: "document-v2-base",
  baseRevision: 9,
});

async function makeGoldenPayload(): Promise<ImportPayload> {
  const bytes = new Uint8Array(
    await readFile(resolve(fixtureRoot, "goldens/minimal.changes.json")),
  );
  return Object.freeze({
    identity: IDENTITY,
    channel: "file",
    displayName: "minimal.changes.json",
    mediaType: "application/json",
    observedByteLength: bytes.byteLength,
    bytes,
  }) as never;
}

function makeCoordinator() {
  const allocated: ImportReplacementCommandSeed[] = [];
  const coordinator = createPrepareImportPreviewCoordinatorV2(
    {
      preflightDocumentImportBytes,
      decodeUtf8Fatal,
      classifyJsonLexically,
      parseJsonData,
      decodeDocumentShape,
      validateDocumentSemantics,
      migrateLegacyJson,
      legacyMigrationDependencies: {
        idFactory: makeTestIdFactory(),
        parseChordSymbol,
        resolveChord,
      },
      parseChartText,
      buildChartDocumentCandidate,
      chartIdFactory: makeTestIdFactory(),
    },
    () => {
      allocated.push(COMMAND_SEED);
      return COMMAND_SEED;
    },
  );
  return { coordinator, allocated };
}

async function makeRetainedPreview() {
  const { coordinator, allocated } = makeCoordinator();
  const request: PrepareImportPreviewRequestV2 = Object.freeze({
    payload: await makeGoldenPayload(),
    formatHint: "json",
    replacementImpactProjection: RETAINED_PROJECTION,
    nonUndoableConfirmationSeed: Object.freeze({
      confirmationId: "confirm-v2-preview-1",
    }),
  }) as never;
  const result = coordinator(request);
  return { result, allocated };
}

describe("E0 v2 preview coordinator (real pipeline, state-free)", () => {
  test("the golden canonical JSON previews through the real F2/F3 pipeline", async () => {
    const { result, allocated } = await makeRetainedPreview();
    expect(`preview ok=${String(result.ok)}`).toBe("preview ok=true");
    if (!result.ok) return;
    const preview = result.value;
    expect(preview.sourceFormat).toBe("canonical-json-v2");
    expect(preview.replacementOrigin).toBe("canonical-import");
    /* RES-02: the projection IS the disclosure, by reference */
    expect(preview.replacementImpact).toBe(RETAINED_PROJECTION as never);
    /* the displayed command seed is the application-allocated token */
    expect(preview.replacementCommandSeed).toBe(COMMAND_SEED);
    expect(allocated.length).toBe(1);
    /* retained disposition displays no confirmation requirement */
    expect(preview.nonUndoableConfirmationRequirement).toBeNull();
    expect(preview.rawSourceRetained).toBe(false);
    expect(preview.autoApplyAuthorized).toBe(false);
  });

  test("RES-03: the projection maps the preview to the owner request field-for-field", async () => {
    const { result } = await makeRetainedPreview();
    if (!result.ok) throw new Error("PREVIEW_FAILED");
    const preview = result.value;
    const transition = Object.freeze({
      kind: "retiring-transport",
      requestId: IDENTITY.requestId,
      origin: "canonical-import",
      baseRevision: IDENTITY.baseRevision,
      candidateDocumentId: String(preview.candidate.id),
      undoDisposition: "retained",
    });
    const projected = projectPreviewToCommitRequestV2(
      preview,
      transition as never,
      null,
    );
    expect(projected.ok).toBe(true);
    if (!projected.ok) return;
    const ownerRequest = projected.value.ownerRequest;
    expect(ownerRequest.identity).toBe(preview.identity);
    expect(ownerRequest.sourceFormat).toBe("canonical-json-v2");
    expect(ownerRequest.replacementOrigin).toBe("canonical-import");
    /* by-reference law: never re-decoded */
    expect(ownerRequest.candidate).toBe(preview.candidate);
    expect(ownerRequest.replacementCommandSeed).toBe(
      preview.replacementCommandSeed,
    );
    /* RESCASE-003: the disclosure travels unchanged */
    expect(ownerRequest.disclosedImpact).toBe(RETAINED_PROJECTION as never);
    expect(ownerRequest.currentTransition).toBe(transition as never);
    expect(ownerRequest.nonUndoableConfirmation).toBeNull();
    expect(projected.value.confirmationBinding).toEqual({
      displayedRequirement: null,
      acknowledgement: null,
      byteMatchProvedBeforeOwnerCall: true,
    } as never);
  });

  test("a disposition disagreement between preview and transition refuses transition-mismatch", async () => {
    const { result } = await makeRetainedPreview();
    if (!result.ok) throw new Error("PREVIEW_FAILED");
    const preview = result.value;
    const projected = projectPreviewToCommitRequestV2(
      preview,
      Object.freeze({
        kind: "retiring-transport",
        requestId: IDENTITY.requestId,
        origin: "canonical-import",
        baseRevision: IDENTITY.baseRevision,
        candidateDocumentId: String(preview.candidate.id),
        undoDisposition: "explicitly-unavailable",
      }) as never,
      null,
    );
    expect(projected).toEqual({
      ok: false,
      code: "import.replacement_transition_mismatch",
    } as never);
  });

  test("the projected request passes the driver's shape gate and commits end-to-end", async () => {
    const { result } = await makeRetainedPreview();
    if (!result.ok) throw new Error("PREVIEW_FAILED");
    const preview = result.value;
    const transition = Object.freeze({
      kind: "retiring-transport",
      requestId: IDENTITY.requestId,
      origin: "canonical-import",
      baseRevision: IDENTITY.baseRevision,
      candidateDocumentId: String(preview.candidate.id),
      undoDisposition: "retained",
    });
    const projected = projectPreviewToCommitRequestV2(
      preview,
      transition as never,
      null,
    );
    if (!projected.ok) throw new Error("PROJECTION_FAILED");

    const prepareRequests: unknown[] = [];
    const preparedValue = Object.freeze({
      schema: "changes.prepared-import-replacement-publication.v1",
      identity: IDENTITY,
      sourceFormat: "canonical-json-v2",
      candidateDocumentId: String(preview.candidate.id),
      expectedTransportGeneration: 2,
      committingTransition: Object.freeze({
        kind: "committing",
        requestId: IDENTITY.requestId,
        origin: "canonical-import",
        baseRevision: IDENTITY.baseRevision,
        candidateDocumentId: String(preview.candidate.id),
        undoDisposition: "retained",
      }),
    });
    const ports: A0E0InterchangeOwnerPorts = {
      prepareImportReplacementPublication: (ownerRequest) => {
        prepareRequests.push(ownerRequest);
        return Object.freeze({ ok: true, value: preparedValue });
      },
      discardImportReplacementPublication: () => {
        throw new Error("DISCARD_MUST_NOT_RUN_ON_THE_SUCCESS_PATH");
      },
      publishImportReplacement: () =>
        Object.freeze({
          ok: true,
          outcome: "committed",
          identity: IDENTITY,
          documentId: String(preview.candidate.id),
          revision: 10,
          effects: Object.freeze([]),
          counters: Object.freeze({
            sectionsVisited: 1,
            measuresVisited: 1,
            eventsVisited: 1,
            stableIdsIndexed: 3,
            historyEntriesVisited: 1,
            historyBytesEstimated: 4210,
            bookmarksRepaired: 0,
            requestsCompared: 1,
            transportNotificationsCompared: 1,
            validationCalls: 1,
          }),
          liveForRequest: 0,
        }),
      readCurrentApplicationDocumentIdentity: () =>
        Object.freeze({ documentId: IDENTITY.documentId, revision: 9 }),
      publishCanonicalExportRevision: () => {
        throw new Error("MARKER_PORT_MUST_NOT_RUN_IN_COMMIT_PATH");
      },
    };
    const x1: X1ReplacementRetirementAdapter = Object.freeze({
      retireImportReplacement: (sent: RetireImportReplacementRequest) =>
        Promise.resolve(
          Object.freeze({
            ok: true,
            value: Object.freeze({
              schema: "changes.x1-replacement-retirement-evidence.v1",
              authority: "x1-serialized-transport",
              request: sent,
              receipt: Object.freeze({
                requestId: IDENTITY.requestId,
                retiredTransportGeneration: 2,
                progressionRetired: true,
                previewRetired: true,
                noFutureAttack: true,
              }),
            }),
          }),
        ) as never,
    });
    const driver = createE0V2TransactionDriver(ports, x1);
    const outcome = await driver(projected.value);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.documentId).toBe(preview.candidate.id);
    expect(outcome.revision).toBe(10);
    /* the owner received the exact projected request object */
    expect(prepareRequests[0]).toBe(projected.value.ownerRequest);
  });
});
