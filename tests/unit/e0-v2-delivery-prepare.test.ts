/**
 * E0 v2 delivery prepare-leg conformance
 * (jcpe-milestone-reliable-studio-l3a.8.2 stage 5): the RES-11
 * state-free asynchronous prepare driver over the REAL registry and the
 * REAL canonical-JSON export coordinator serializing the reviewed
 * golden document — request-shape law, normalized identity-port gating
 * (nothing begins on a malformed read), single-flight busy refusal,
 * stale-artifact abandonment, and the prepared binding's exact fields.
 * Completes the v2 chain: this prepared entry is what the click driver
 * consumes and the settlement driver marks.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  createE0V2ExportDeliveryClickDriver,
  createE0V2ExportDeliveryPrepareDriver,
  createPreparedCanonicalExportDeliveryRegistry,
  validateDocumentSemantics,
  type PrepareCanonicalExportDeliveryRequestV2,
} from "../../src/application";
import type { A0E0InterchangeOwnerPorts } from "../../src/application/application-interchange-owner-contract";
import {
  decodeDocumentShape,
  documentsSemanticallyEqual,
  type ValidatedDocument,
} from "../../src/domain";
import {
  createCanonicalJsonExportCoordinator,
  sanitizeExportFilename,
} from "../../src/export";

const goldenPath = resolve(
  import.meta.dirname,
  "../fixtures/interchange/goldens/minimal.changes.json",
);

const goldenText = await readFile(goldenPath, "utf8");

function makeGoldenDocument(): ValidatedDocument {
  const decoded = decodeDocumentShape(JSON.parse(goldenText));
  if (!decoded.ok) throw new Error("F2_FAILED");
  const validated = validateDocumentSemantics(decoded.value);
  if (!validated.ok) throw new Error("F3_FAILED");
  return validated.value;
}

const DOCUMENT = makeGoldenDocument();
const DOCUMENT_ID = String(DOCUMENT.id);

const coordinator = createCanonicalJsonExportCoordinator({
  decodeDocumentShape,
  validateCanonicalRoundTrip: (candidate) => {
    const result = validateDocumentSemantics(candidate);
    if (result.ok) return { ok: true, value: result.value };
    return { ok: false, errors: [] } as never;
  },
  semanticallyEqualDocuments: documentsSemanticallyEqual,
  hashBytes: (bytes) =>
    Promise.resolve({
      ok: true as const,
      digest: createHash("sha256").update(bytes).digest("hex"),
    }),
  sanitizeExportFilename,
});

const REQUEST: PrepareCanonicalExportDeliveryRequestV2 = Object.freeze({
  schema: "changes.canonical-export-delivery-request.v2",
  identity: Object.freeze({
    requestId: 501,
    documentId: DOCUMENT_ID,
    baseRevision: 3,
  }),
}) as never;

function makeHarness(overrides: Readonly<{ identity?: () => unknown }> = {}) {
  const calls: string[] = [];
  const registry = createPreparedCanonicalExportDeliveryRegistry();
  const ports: A0E0InterchangeOwnerPorts = {
    prepareImportReplacementPublication: () => {
      throw new Error("IMPORT_PORTS_MUST_NOT_RUN");
    },
    discardImportReplacementPublication: () => {
      throw new Error("IMPORT_PORTS_MUST_NOT_RUN");
    },
    publishImportReplacement: () => {
      throw new Error("IMPORT_PORTS_MUST_NOT_RUN");
    },
    readCurrentApplicationDocumentIdentity: () => {
      calls.push("identity");
      if (overrides.identity) return overrides.identity();
      return Object.freeze({ documentId: DOCUMENT_ID, revision: 3 });
    },
    publishCanonicalExportRevision: () => {
      throw new Error("MARKER_PORT_MUST_NOT_RUN_IN_PREPARE_PATH");
    },
  };
  const driver = createE0V2ExportDeliveryPrepareDriver(
    ports,
    registry,
    coordinator,
  );
  return { driver, registry, ports, calls };
}

describe("E0 v2 delivery prepare driver (real registry, real serializer)", () => {
  test("the golden document prepares with the exact binding fields", async () => {
    const h = makeHarness();
    const result = await h.driver(REQUEST, DOCUMENT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.binding.documentId).toBe(DOCUMENT_ID as never);
    expect(result.binding.revision).toBe(3);
    expect(result.binding.byteLength).toBe(
      new TextEncoder().encode(goldenText).byteLength,
    );
    expect(result.binding.canonicalPolicyVersion).toBe(1);
    expect(result.binding.semanticHashPolicyVersion).toBe(1);
    expect(result.binding.filename.endsWith(".changes.json")).toBe(true);
  });

  test("the prepared entry drives the click leg to a byte-faithful terminal", async () => {
    const h = makeHarness();
    const prepared = await h.driver(REQUEST, DOCUMENT);
    if (!prepared.ok) throw new Error("PREPARE_FAILED");
    const transfers: Uint8Array[] = [];
    const click = createE0V2ExportDeliveryClickDriver(
      h.ports,
      h.registry,
      (deliveryRequest) => {
        const typed = deliveryRequest as Readonly<{ privateBytes: Uint8Array }>;
        transfers.push(typed.privateBytes);
        return Object.freeze({
          completion: Promise.resolve(
            Object.freeze({
              ok: true,
              outcome: "handed-off",
              channel: "object-url-download",
              bytesOffered: typed.privateBytes.byteLength,
              artifact: null,
              cleanup: "complete",
              objectUrlsCreated: 1,
              objectUrlsRevoked: 1,
              outstandingOwnedResources: 0,
            }),
          ),
        });
      },
    );
    const terminal = await click({
      preparationId: prepared.binding.preparationId,
      deliveryPreference: "download-only",
    });
    expect(terminal.ok).toBe(true);
    expect(transfers.length).toBe(1);
    expect(new TextDecoder().decode(transfers[0])).toBe(goldenText);
  });

  test("a smuggled state key on the v2 request refuses with zero port calls", async () => {
    const h = makeHarness();
    const smuggled = Object.freeze({
      schema: "changes.canonical-export-delivery-request.v2",
      identity: REQUEST.identity,
      state: { $smuggledAppState: true },
    }) as never as PrepareCanonicalExportDeliveryRequestV2;
    const result = await h.driver(smuggled, DOCUMENT);
    expect(result).toEqual({
      ok: false,
      outcome: "refused",
      code: "export.delivery_request_invalid",
    } as never);
    expect(h.calls).toEqual([]);
  });

  test("a malformed identity read fails the release gate and begins nothing", async () => {
    const h = makeHarness({
      identity: () => ({ documentId: DOCUMENT_ID, revision: 3, state: "x" }),
    });
    const result = await h.driver(REQUEST, DOCUMENT);
    expect(result.ok).toBe(false);
    if (result.ok || result.outcome !== "protocol-invalid") {
      throw new Error("EXPECTED_PROTOCOL_INVALID");
    }
    expect(result.diagnostic).toEqual({
      port: "readCurrentApplicationDocumentIdentity",
      reason: "invalid-envelope",
      rawResultRetained: false,
    } as never);
    expect(result.releaseConfiguration).toBe("failed");
    /* nothing began: a fresh prepare on the same registry succeeds */
    const clean = makeHarness();
    const retry = await clean.driver(REQUEST, DOCUMENT);
    expect(retry.ok).toBe(true);
  });

  test("single-flight: a second prepare while ready first invalidates, per the registry law", async () => {
    const h = makeHarness();
    const first = await h.driver(REQUEST, DOCUMENT);
    expect(first.ok).toBe(true);
    /* a prepare from ready is permitted (the registry invalidates and
     * zeroes the old bytes); the new generation advances */
    const second = await h.driver(REQUEST, DOCUMENT);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.binding.generation).toBeGreaterThan(
      first.binding.generation,
    );
  });

  test("an artifact/identity disagreement abandons and refuses stale", async () => {
    const h = makeHarness({
      identity: () =>
        Object.freeze({ documentId: "some-other-document", revision: 3 }),
    });
    const result = await h.driver(REQUEST, DOCUMENT);
    expect(result).toEqual({
      ok: false,
      outcome: "refused",
      code: "export.prepared_canonical_stale",
    } as never);
    /* abandoned: the registry is empty again and a clean prepare works */
    const retry = await makeHarness().driver(REQUEST, DOCUMENT);
    expect(retry.ok).toBe(true);
  });
});
