/**
 * E0 v2 delivery click-path conformance
 * (jcpe-milestone-reliable-studio-l3a.8.2 stage 5): the section-10
 * activation-safe start primitive over scripted browser globals, and the
 * RES-11 click driver over the REAL prepared-delivery registry — replaying
 * WF-008 (a malformed identity-read return is the invalid-envelope
 * diagnostic, the release gate fails, and no browser call follows), the
 * synchronous-invocation law (the anchor activates before the start
 * primitive returns), the gesture refusal, exact byte transfer, the
 * consume-exactly-once law, and the cleanup receipts.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";

import {
  createE0V2ExportDeliveryClickDriver,
  createPreparedCanonicalExportDeliveryRegistry,
} from "../../src/application";
import type { A0E0InterchangeOwnerPorts } from "../../src/application/application-interchange-owner-contract";
import {
  startPreparedExportDelivery,
  type PreparedExportDeliveryRequest,
} from "../../src/export";

const workflowFixturePath = resolve(
  import.meta.dirname,
  "../fixtures/interchange-v2/workflow-cases.json",
);
const workflowFixture = JSON.parse(
  await readFile(workflowFixturePath, "utf8"),
) as Readonly<{ cases: readonly Readonly<Record<string, unknown>>[] }>;

const BINDING = Object.freeze({
  kind: "canonical-json",
  sourceDocumentId: "document-v2-base",
  filename: "document-v2-base.changes.json",
  byteLength: 5,
  semanticDocumentHash: "b".repeat(64),
});

const BYTES = new Uint8Array([123, 34, 97, 34, 125]);

type MutableGlobals = {
  navigator?: unknown;
  document?: unknown;
  URL?: unknown;
  Blob?: unknown;
  showSaveFilePicker?: unknown;
};

const g = globalThis as unknown as MutableGlobals;
const saved = {
  navigator: g.navigator,
  document: g.document,
  URL: g.URL,
  Blob: g.Blob,
  showSaveFilePicker: g.showSaveFilePicker,
};

afterEach(() => {
  g.navigator = saved.navigator;
  g.document = saved.document;
  g.URL = saved.URL;
  g.Blob = saved.Blob;
  g.showSaveFilePicker = saved.showSaveFilePicker;
});

function scriptBlobGlobals(overrides: Readonly<{
  removeThrows?: boolean;
  revokeThrows?: boolean;
  active?: boolean;
}> = {}) {
  const log: string[] = [];
  const anchors: Array<{ href: string; download: string }> = [];
  g.navigator = { userActivation: { isActive: overrides.active ?? true } };
  g.Blob = Blob;
  g.URL = {
    createObjectURL: () => {
      log.push("create-url");
      return "blob:mock-url-1";
    },
    revokeObjectURL: () => {
      log.push("revoke-url");
      if (overrides.revokeThrows) throw new Error("REVOKE_FAILED");
    },
  };
  g.document = {
    createElement: () => {
      const anchor = {
        href: "",
        download: "",
        style: { display: "" },
        click: () => {
          log.push("click");
        },
      };
      anchors.push(anchor);
      return anchor;
    },
    body: {
      appendChild: () => {
        log.push("append");
      },
      removeChild: () => {
        log.push("remove");
        if (overrides.removeThrows) throw new Error("REMOVE_FAILED");
      },
    },
  };
  g.showSaveFilePicker = undefined;
  return { log, anchors };
}

function makeRequest(): PreparedExportDeliveryRequest {
  return Object.freeze({
    binding: BINDING,
    privateBytes: BYTES,
    preference: "download-only",
  }) as never;
}

describe("section-10 start primitive (scripted browser globals)", () => {
  test("the anchor path activates synchronously and hands off with exact cleanup counts", async () => {
    const { log, anchors } = scriptBlobGlobals();
    const envelope = startPreparedExportDelivery(makeRequest()) as Readonly<{
      completion: Promise<unknown>;
    }>;
    /* synchronous-invocation law: the activation happened BEFORE return */
    expect(log).toEqual(["create-url", "append", "click", "remove", "revoke-url"]);
    expect(anchors[0]?.download).toBe(BINDING.filename);
    const receipt = await envelope.completion;
    expect(receipt).toEqual({
      ok: true,
      outcome: "handed-off",
      channel: "object-url-download",
      bytesOffered: 5,
      artifact: BINDING,
      cleanup: "complete",
      objectUrlsCreated: 1,
      objectUrlsRevoked: 1,
      outstandingOwnedResources: 0,
    } as never);
  });

  test("an observed-false activation probe refuses with zero browser work", async () => {
    const { log } = scriptBlobGlobals({ active: false });
    const envelope = startPreparedExportDelivery(makeRequest()) as Readonly<{
      completion: Promise<unknown>;
    }>;
    expect(log).toEqual([]);
    const receipt = (await envelope.completion) as Readonly<{
      code: string;
      outcome: string;
    }>;
    expect(receipt.outcome).toBe("failed");
    expect(receipt.code).toBe("export.delivery_user_gesture_required");
  });

  test("a revoke failure is the honest object-url cleanup breach", async () => {
    scriptBlobGlobals({ revokeThrows: true });
    const envelope = startPreparedExportDelivery(makeRequest()) as Readonly<{
      completion: Promise<unknown>;
    }>;
    const receipt = (await envelope.completion) as Readonly<
      Record<string, unknown>
    >;
    expect(receipt["outcome"]).toBe("cleanup-failed");
    expect(receipt["cleanupFailureKinds"]).toEqual(["object-url-revoke"]);
    expect(receipt["objectUrlsCreated"]).toBe(1);
    expect(receipt["objectUrlsRevoked"]).toBe(0);
    expect(receipt["outstandingOwnedResources"]).toBe(1);
    expect(receipt["artifact"]).toBeNull();
  });

  test("the FSA path writes the exact transferred bytes and completes", async () => {
    scriptBlobGlobals();
    const writes: Uint8Array[] = [];
    let closed = 0;
    g.showSaveFilePicker = () =>
      Promise.resolve({
        createWritable: () =>
          Promise.resolve({
            write: (data: Uint8Array) => {
              writes.push(data);
              return Promise.resolve();
            },
            close: () => {
              closed += 1;
              return Promise.resolve();
            },
          }),
      });
    const envelope = startPreparedExportDelivery(
      Object.freeze({
        binding: BINDING,
        privateBytes: BYTES,
        preference: "prefer-file-system-access",
      }) as never,
    ) as Readonly<{ completion: Promise<unknown> }>;
    const receipt = (await envelope.completion) as Readonly<
      Record<string, unknown>
    >;
    expect(receipt["outcome"]).toBe("completed");
    expect(receipt["channel"]).toBe("file-system-access");
    expect(receipt["bytesOffered"]).toBe(5);
    expect(writes.length).toBe(1);
    expect(writes[0]).toBe(BYTES);
    expect(closed).toBe(1);
  });

  test("a user AbortError is cancelled and never launches a Blob fallback", async () => {
    const { log } = scriptBlobGlobals();
    const abort = new Error("user closed the picker");
    abort.name = "AbortError";
    g.showSaveFilePicker = () => Promise.reject(abort);
    const envelope = startPreparedExportDelivery(
      Object.freeze({
        binding: BINDING,
        privateBytes: BYTES,
        preference: "prefer-file-system-access",
      }) as never,
    ) as Readonly<{ completion: Promise<unknown> }>;
    const receipt = (await envelope.completion) as Readonly<
      Record<string, unknown>
    >;
    expect(receipt["outcome"]).toBe("cancelled");
    expect(receipt["channel"]).toBe("file-system-access");
    /* no anchor/object-URL work happened */
    expect(log).toEqual([]);
  });
});

describe("E0 v2 click driver over the real registry (WF-008)", () => {
  function makeHarness(overrides: Readonly<{
    identity?: () => unknown;
    start?: (req: unknown) => unknown;
  }> = {}) {
    const calls: string[] = [];
    const registry = createPreparedCanonicalExportDeliveryRegistry();
    const begin = registry.begin(
      Object.freeze({ documentId: "document-v2-base", revision: 9 }) as never,
    );
    if (!begin.ok) throw new Error("REGISTRY_BEGIN_FAILED");
    registry.publish(
      Object.freeze({
        schema: "changes.prepared-canonical-export-delivery.v1",
        identity: begin.identity,
        binding: BINDING,
        privateBytes: BYTES,
      }) as never,
    );
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
        return Object.freeze({ documentId: "document-v2-base", revision: 9 });
      },
      publishCanonicalExportRevision: () => {
        calls.push("marker");
        throw new Error("MARKER_PORT_MUST_NOT_RUN_IN_CLICK_PATH");
      },
    };
    const driver = createE0V2ExportDeliveryClickDriver(
      ports,
      registry,
      (req) => {
        calls.push("browser-start");
        if (overrides.start) return overrides.start(req);
        return Object.freeze({
          completion: Promise.resolve(
            Object.freeze({
              ok: true,
              outcome: "handed-off",
              channel: "object-url-download",
              bytesOffered: 5,
              artifact: BINDING,
              cleanup: "complete",
              objectUrlsCreated: 1,
              objectUrlsRevoked: 1,
              outstandingOwnedResources: 0,
            }),
          ),
        });
      },
    );
    return {
      driver,
      calls,
      registry,
      preparationId: begin.identity.preparationId,
    };
  }

  test("WF-008: a malformed identity read fails the release gate with zero browser calls", async () => {
    const wf = workflowFixture.cases.find((c) => c["id"] === "E0V2-WF-008");
    if (wf === undefined) throw new Error("MISSING_FIXTURE_ROW");
    const h = makeHarness({
      identity: () => ({
        documentId: "document-v2-base",
        revision: 9,
        state: "smuggled",
      }),
    });
    const result = await h.driver({
      preparationId: h.preparationId,
      deliveryPreference: "download-only",
    });
    expect(result.ok).toBe(false);
    if (result.ok || result.outcome !== "protocol-invalid") {
      throw new Error("EXPECTED_PROTOCOL_INVALID");
    }
    expect(result.diagnostic).toEqual(wf["expectedDiagnostic"] as never);
    expect(result.releaseConfiguration).toBe("failed");
    const browserCalls = h.calls.filter((c) => c === "browser-start").length;
    expect(browserCalls).toBe(wf["browserCalls"] as number);
    /* the ready entry was NOT consumed: a later click still works */
    const retry = await h.driver({
      preparationId: h.preparationId,
      deliveryPreference: "download-only",
    });
    expect(retry.ok).toBe(false);
  });

  test("a clean click consumes the entry exactly once and surfaces the terminal receipt", async () => {
    const h = makeHarness();
    const result = await h.driver({
      preparationId: h.preparationId,
      deliveryPreference: "download-only",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.delivery.outcome).toBe("handed-off");
    /* consumed exactly once: the double-click is unavailable */
    const second = await h.driver({
      preparationId: h.preparationId,
      deliveryPreference: "download-only",
    });
    expect(second).toEqual({
      ok: false,
      outcome: "refused",
      code: "export.prepared_canonical_unavailable",
    } as never);
  });

  test("a stale identity discards the exact entry with no browser call", async () => {
    const h = makeHarness({
      identity: () =>
        Object.freeze({ documentId: "document-v2-base", revision: 12 }),
    });
    const result = await h.driver({
      preparationId: h.preparationId,
      deliveryPreference: "download-only",
    });
    expect(result).toEqual({
      ok: false,
      outcome: "refused",
      code: "export.prepared_canonical_stale",
    } as never);
    expect(h.calls).not.toContain("browser-start");
  });

  test("a bare-promise start (not the synchronous envelope) is delivery-protocol-invalid", async () => {
    const h = makeHarness({
      start: () => Promise.resolve({ ok: true, outcome: "handed-off" }),
    });
    const result = await h.driver({
      preparationId: h.preparationId,
      deliveryPreference: "download-only",
    });
    expect(result.ok).toBe(false);
    if (result.ok || result.outcome !== "delivery-protocol-invalid") {
      throw new Error("EXPECTED_DELIVERY_PROTOCOL_INVALID");
    }
    expect(result.cleanupKnowledge).toBe("unknown");
    expect(result.maximumPossibleOutstandingOwnedResources).toBe(4);
  });

  test("an untypable completion is delivery-protocol-invalid with no fabricated counts", async () => {
    const h = makeHarness({
      start: () =>
        Object.freeze({
          completion: Promise.resolve({ outcome: "mystery" }),
        }),
    });
    const result = await h.driver({
      preparationId: h.preparationId,
      deliveryPreference: "download-only",
    });
    expect(result.ok).toBe(false);
    if (result.ok || result.outcome !== "delivery-protocol-invalid") {
      throw new Error("EXPECTED_DELIVERY_PROTOCOL_INVALID");
    }
    expect(result.deliveryResourceReconciliation).toBe("required");
  });
});
