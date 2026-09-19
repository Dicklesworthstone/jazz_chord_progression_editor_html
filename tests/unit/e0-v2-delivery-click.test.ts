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
  deliverExportArtifact,
  CANONICAL_JSON_ARTIFACT_SCHEMA,
  CANONICAL_JSON_MEDIA_TYPE,
  type ExportDeliveryRequest,
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
  window?: unknown;
};

const g = globalThis as unknown as MutableGlobals;
const savedWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
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
  if (savedWindowDescriptor === undefined) Reflect.deleteProperty(globalThis, "window");
  else Object.defineProperty(globalThis, "window", savedWindowDescriptor);
});

function scriptBlobGlobals(overrides: Readonly<{
  removeThrows?: boolean;
  revokeThrows?: boolean;
  active?: boolean;
  failAt?: "blob" | "url" | "anchor" | "append" | "click";
}> = {}) {
  const log: string[] = [];
  const anchors: Array<{ href: string; download: string }> = [];
  g.navigator = { userActivation: { isActive: overrides.active ?? true } };
  g.Blob = overrides.failAt === "blob" ? class extends Blob {
    constructor() { super(); throw new Error("BLOB_FAILED"); }
  } : saved.Blob;
  g.URL = {
    createObjectURL: () => {
      log.push("create-url");
      if (overrides.failAt === "url") throw new Error("CREATE_URL_FAILED");
      return "blob:mock-url-1";
    },
    revokeObjectURL: () => {
      log.push("revoke-url");
      if (overrides.revokeThrows) throw new Error("REVOKE_FAILED");
    },
  };
  g.document = {
    createElement: () => {
      if (overrides.failAt === "anchor") throw new Error("CREATE_ANCHOR_FAILED");
      const anchor = {
        href: "",
        download: "",
        hidden: false,
        style: { display: "" },
        click: () => {
          log.push("click");
          if (overrides.failAt === "click") throw new Error("CLICK_FAILED");
        },
      };
      anchors.push(anchor);
      return anchor;
    },
    body: {
      appendChild: () => {
        log.push("append");
        if (overrides.failAt === "append") throw new Error("APPEND_FAILED");
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

function readCompletion(envelope: unknown): Promise<unknown> {
  if (typeof envelope !== "object" || envelope === null || !("completion" in envelope) ||
      !(envelope.completion instanceof Promise)) throw new Error("INVALID_DELIVERY_ENVELOPE");
  return envelope.completion;
}

function publicRequest(): ExportDeliveryRequest {
  const binding = makeRequest().binding;
  if (binding.kind !== "canonical-json") throw new Error("EXPECTED_JSON_BINDING");
  return {
    artifact: { ...binding, schema: CANONICAL_JSON_ARTIFACT_SCHEMA,
      mediaType: CANONICAL_JSON_MEDIA_TYPE, text: new TextDecoder().decode(BYTES) },
    preference: "download-only",
  };
}

describe("public export delivery cleanup", () => {
  for (const row of [
    { failAt: "blob", log: [], urls: 0 },
    { failAt: "url", log: ["create-url"], urls: 0 },
    { failAt: "click", log: ["create-url", "append", "click", "remove", "revoke-url"], urls: 1 },
  ] as const) {
    test(`public ${row.failAt} failure releases only the admitted resources`, async () => {
      const { log } = scriptBlobGlobals({ failAt: row.failAt });
      const result: unknown = await deliverExportArtifact(publicRequest());
      expect(log).toEqual([...row.log]);
      expect(result).toEqual({ ok: false, outcome: "failed", code: "export.delivery_activation_failed",
        channel: "object-url-download", artifact: BINDING, cleanup: "complete",
        objectUrlsCreated: row.urls, objectUrlsRevoked: row.urls, outstandingOwnedResources: 0 });
    });
  }
  test("public cleanup failures retain both outstanding resources without retrying revoke", async () => {
    const { log } = scriptBlobGlobals({ removeThrows: true, revokeThrows: true });
    const result: unknown = await deliverExportArtifact(publicRequest());
    expect(log).toEqual(["create-url", "append", "click", "remove", "revoke-url"]);
    expect(result).toMatchObject({ ok: false, outcome: "cleanup-failed", artifact: null,
      cleanup: "reconciliation-required", cleanupFailureKinds: ["anchor-remove", "object-url-revoke"],
      objectUrlsCreated: 1, objectUrlsRevoked: 0, outstandingOwnedResources: 2 });
  });
  test("public call without activation starts no browser work", async () => {
    const { log } = scriptBlobGlobals({ active: false });
    const result: unknown = await deliverExportArtifact(publicRequest());
    expect(log).toEqual([]);
    expect(result).toMatchObject({ ok: false, code: "export.delivery_user_gesture_required",
      objectUrlsCreated: 0, objectUrlsRevoked: 0, outstandingOwnedResources: 0 });
  });
  test("public FSA writes exact bytes and cancellation never falls back", async () => {
    const { log } = scriptBlobGlobals();
    const writes: Uint8Array[] = [];
    g.showSaveFilePicker = () => Promise.resolve({ createWritable: () => Promise.resolve({
      write: (bytes: Uint8Array) => { writes.push(bytes); return Promise.resolve(); },
      close: () => { log.push("close"); return Promise.resolve(); },
    }) });
    const request = { ...publicRequest(), preference: "prefer-file-system-access" as const };
    expect(await deliverExportArtifact(request)).toMatchObject({ ok: true, outcome: "completed", bytesOffered: BYTES.length });
    expect(writes).toEqual([BYTES]);
    expect(log).toEqual(["close"]);
    g.showSaveFilePicker = () => Promise.reject(new DOMException("Cancelled", "AbortError"));
    expect(await deliverExportArtifact(request)).toMatchObject({ ok: true, outcome: "cancelled" });
    expect(log).toEqual(["close"]);
  });
});

describe("typed browser export boundaries", () => {
  for (const shared of [false, true]) {
    test(`Blob preserves only the offered subarray and snapshots ${shared ? "shared" : "ordinary"} bytes`, async () => {
      const { log } = scriptBlobGlobals();
      const storage = shared ? new SharedArrayBuffer(9) : new ArrayBuffer(9);
      const backing = new Uint8Array(storage);
      backing.set([255, 254, 123, 34, 97, 34, 125, 253, 252]);
      const bytes = backing.subarray(2, 7);
      let offered: Blob | undefined;
      g.URL = {
        createObjectURL: (blob: Blob) => { offered = blob; log.push("create-url"); return "blob:exact"; },
        revokeObjectURL: () => { log.push("revoke-url"); },
      };
      const envelope = startPreparedExportDelivery({ ...makeRequest(), privateBytes: bytes });
      expect(log).toEqual(["create-url", "append", "click", "remove", "revoke-url"]);
      backing.fill(0);
      if (offered === undefined) throw new Error("Missing offered Blob");
      expect(Array.from(new Uint8Array(await offered.arrayBuffer()))).toEqual([123, 34, 97, 34, 125]);
      expect(offered.type).toBe(CANONICAL_JSON_MEDIA_TYPE);
      expect(await readCompletion(envelope)).toMatchObject({ ok: true, outcome: "handed-off", bytesOffered: 5 });
    });
  }

  test("checked picker, handle and writer retain native method receivers", async () => {
    const { log } = scriptBlobGlobals();
    const writer = {
      write(this: unknown, bytes: Uint8Array) {
        expect(this).toBe(writer); expect(bytes).toBe(BYTES); log.push("write");
        return Promise.resolve();
      },
      close(this: unknown) { expect(this).toBe(writer); log.push("close"); return Promise.resolve(); },
    };
    const handle = {
      createWritable(this: unknown) { expect(this).toBe(handle); return Promise.resolve(writer); },
    };
    g.showSaveFilePicker = function (this: unknown) {
      expect(this).toBe(globalThis); log.push("picker"); return Promise.resolve(handle);
    };
    const envelope = startPreparedExportDelivery({ ...makeRequest(), preference: "prefer-file-system-access" });
    expect(log).toEqual(["picker"]);
    expect(await readCompletion(envelope)).toMatchObject({ ok: true, outcome: "completed", bytesOffered: 5 });
    expect(log).toEqual(["picker", "write", "close"]);
  });
});

describe("file writer failure cleanup", () => {
  for (const entry of ["public", "prepared"] as const) {
    for (const failedOperation of ["write", "close"] as const) {
      for (const abortOutcome of ["success", "rejected", "absent"] as const) {
        test(`${entry}: ${failedOperation} failure with ${abortOutcome} abort`, async () => {
          const { log } = scriptBlobGlobals();
          const writer = {
            write: () => { log.push("write"); return failedOperation === "write"
              ? Promise.reject(new Error("WRITE_FAILED")) : Promise.resolve(); },
            close: () => { log.push("close"); return Promise.reject(new Error("CLOSE_FAILED")); },
          };
          const abort = () => { log.push("abort"); return abortOutcome === "rejected"
            ? Promise.reject(new Error("ABORT_FAILED")) : Promise.resolve(); };
          g.showSaveFilePicker = () => Promise.resolve({ createWritable: () =>
            Promise.resolve(abortOutcome === "absent" ? writer : { ...writer, abort }) });
          const result: unknown = entry === "public"
            ? await deliverExportArtifact({ ...publicRequest(), preference: "prefer-file-system-access" })
            : await readCompletion(startPreparedExportDelivery({ ...makeRequest(), preference: "prefer-file-system-access" }));
          expect(log).toEqual(["write", ...(failedOperation === "close" ? ["close"] : []),
            ...(abortOutcome === "absent" ? [] : ["abort"])]);
          if (abortOutcome === "success") {
            expect(result).toEqual({ ok: false, outcome: "failed", code: "export.delivery_write_failed",
              channel: "file-system-access", artifact: BINDING, cleanup: "complete",
              objectUrlsCreated: 0, objectUrlsRevoked: 0, outstandingOwnedResources: 0 });
          } else {
            expect(result).toEqual({ ok: false, outcome: "cleanup-failed", code: "export.delivery_cleanup_failed",
              channel: "file-system-access", artifact: null, cleanup: "reconciliation-required",
              cleanupFailureKinds: failedOperation === "close" ? ["writer-close", "writer-abort"] : ["writer-abort"],
              objectUrlsCreated: 0, objectUrlsRevoked: 0, outstandingOwnedResources: 1 });
          }
        });
      }
    }
  }
});

describe("section-10 start primitive (scripted browser globals)", () => {
  for (const row of [
    { failAt: "blob", log: [], urls: 0 },
    { failAt: "url", log: ["create-url"], urls: 0 },
    { failAt: "anchor", log: ["create-url", "revoke-url"], urls: 1 },
    { failAt: "append", log: ["create-url", "append", "revoke-url"], urls: 1 },
    { failAt: "click", log: ["create-url", "append", "click", "remove", "revoke-url"], urls: 1 },
  ] as const) {
    test(`a ${row.failAt} failure reports and releases exactly the admitted resources`, async () => {
      const { log } = scriptBlobGlobals({ failAt: row.failAt });
      const envelope = startPreparedExportDelivery(makeRequest());
      expect(log).toEqual([...row.log]);
      expect(await readCompletion(envelope)).toEqual({
        ok: false, outcome: "failed", code: "export.delivery_activation_failed",
        channel: "object-url-download", artifact: BINDING, cleanup: "complete",
        objectUrlsCreated: row.urls, objectUrlsRevoked: row.urls, outstandingOwnedResources: 0,
      });
    });
  }

  test("failure before activation still reports a refused URL cleanup honestly", async () => {
    const { log } = scriptBlobGlobals({ failAt: "anchor", revokeThrows: true });
    const envelope = startPreparedExportDelivery(makeRequest());
    expect(log).toEqual(["create-url", "revoke-url"]);
    expect(await readCompletion(envelope)).toEqual({
      ok: false, outcome: "cleanup-failed", code: "export.delivery_cleanup_failed",
      channel: "object-url-download", artifact: null, cleanup: "reconciliation-required",
      cleanupFailureKinds: ["object-url-revoke"], objectUrlsCreated: 1,
      objectUrlsRevoked: 0, outstandingOwnedResources: 1,
    });
  });

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

  const clean = { artifact: { ...BINDING }, cleanup: "complete", outstandingOwnedResources: 0 };
  const terminalCases = [
    { ...clean, ok: true, outcome: "handed-off", channel: "object-url-download", bytesOffered: 5, objectUrlsCreated: 1, objectUrlsRevoked: 1 },
    { ...clean, ok: true, outcome: "completed", channel: "file-system-access", bytesOffered: 5, objectUrlsCreated: 0, objectUrlsRevoked: 0 },
    { ...clean, ok: true, outcome: "cancelled", channel: "file-system-access", objectUrlsCreated: 0, objectUrlsRevoked: 0 },
    ...[
      { channel: null, code: "export.delivery_user_gesture_required", urls: 0 },
      { channel: "file-system-access", code: "export.delivery_write_failed", urls: 0 },
      { channel: "object-url-download", code: "export.delivery_activation_failed", urls: 1 },
      { channel: "object-url-download", code: "export.delivery_capability_failed", urls: 0 },
    ].map(row => ({ ...clean, ok: false, outcome: "failed", channel: row.channel, code: row.code, objectUrlsCreated: row.urls, objectUrlsRevoked: row.urls })),
    ...[
      { channel: "file-system-access", kinds: ["writer-abort"], created: 0, revoked: 0, resources: 1 },
      { channel: "file-system-access", kinds: ["handle-release"], created: 0, revoked: 0, resources: 1 },
      { channel: "file-system-access", kinds: ["writer-abort", "handle-release"], created: 0, revoked: 0, resources: 2 },
      { channel: "file-system-access", kinds: ["writer-close", "writer-abort"], created: 0, revoked: 0, resources: 1 },
      { channel: "file-system-access", kinds: ["writer-close", "writer-abort", "handle-release"], created: 0, revoked: 0, resources: 2 },
      { channel: "object-url-download", kinds: ["anchor-remove"], created: 1, revoked: 1, resources: 1 },
      { channel: "object-url-download", kinds: ["object-url-revoke"], created: 1, revoked: 0, resources: 1 },
      { channel: "object-url-download", kinds: ["anchor-remove", "object-url-revoke"], created: 1, revoked: 0, resources: 2 },
    ].map(row => ({ ok: false, outcome: "cleanup-failed", artifact: null, cleanup: "reconciliation-required",
      code: "export.delivery_cleanup_failed", channel: row.channel, cleanupFailureKinds: row.kinds,
      objectUrlsCreated: row.created, objectUrlsRevoked: row.revoked, outstandingOwnedResources: row.resources })),
  ];
  for (const [index, receipt] of terminalCases.entries()) {
    test(`terminal ${String(index)}: preserves exact receipt in a detached frozen snapshot`, async () => {
      const raw = { ...receipt };
      const h = makeHarness({ start: () => ({ completion: Promise.resolve(raw) }) });
      const result = await h.driver({ preparationId: h.preparationId, deliveryPreference: "download-only" });
      const observed: unknown = result;
      expect(observed).toEqual({ ok: true, outcome: "terminal", delivery: receipt });
      if (!result.ok) throw new Error("EXPECTED_TERMINAL");
      expect(result.delivery).not.toBe(raw);
      expect(Object.isFrozen(result.delivery)).toBe(true);
      if (result.delivery.artifact !== null) {
        expect(result.delivery.artifact).not.toBe(raw.artifact);
        expect(Object.isFrozen(result.delivery.artifact)).toBe(true);
      }
      if (result.delivery.outcome === "cleanup-failed") expect(Object.isFrozen(result.delivery.cleanupFailureKinds)).toBe(true);
      raw.ok = !raw.ok;
      expect(result.delivery.ok).toBe(receipt.ok);
      expect(h.calls).toEqual(["identity", "browser-start"]);
      expect(await h.driver({ preparationId: h.preparationId, deliveryPreference: "download-only" })).toMatchObject({ outcome: "refused" });
    });
  }
  for (const [name, mutate] of [
    ["missing fields", () => ({ ok: true, outcome: "handed-off" })],
    ["wrong ok", (r: object) => ({ ...r, ok: false })],
    ["wrong byte count", (r: object) => ({ ...r, bytesOffered: 4 })],
    ["wrong artifact", (r: object) => ({ ...r, artifact: { ...BINDING, filename: "wrong.json" } })],
    ["wrong cleanup", (r: object) => ({ ...r, objectUrlsRevoked: 0 })],
    ["unknown code", () => ({ ...clean, ok: false, outcome: "failed", channel: null, objectUrlsCreated: 0, objectUrlsRevoked: 0, code: "invented" })],
    ["extra symbol", (r: object) => ({ ...r, [Symbol("extra")]: true })],
    ["inherited fields", (r: object): unknown => Object.create(r)],
    ["throwing reflection", (r: object) => new Proxy(r, { ownKeys() { throw new Error("TRAP"); } })],
    ["accessor", (r: object) => Object.defineProperty({ ...r }, "outcome", { get() { throw new Error("GETTER_MUST_NOT_RUN"); } })],
    ["cross-channel cleanup", () => ({ ...terminalCases[7], channel: "object-url-download" })],
    ["unpaired writer close", () => ({ ...terminalCases[7], cleanupFailureKinds: ["writer-close"] })],
  ] as const) {
    test(`invalid terminal: ${name} reports unknown cleanup without rejecting`, async () => {
      const h = makeHarness({ start: () => ({ completion: Promise.resolve(mutate({ ...terminalCases[0] })) }) });
      expect(await h.driver({ preparationId: h.preparationId, deliveryPreference: "download-only" })).toEqual({
        ok: false, outcome: "delivery-protocol-invalid", code: "export.delivery_result_invalid", cleanupKnowledge: "unknown",
        maximumPossibleOutstandingOwnedResources: 4, deliveryResourceReconciliation: "required",
      });
      expect(h.calls).toEqual(["identity", "browser-start"]);
      expect(await h.driver({ preparationId: h.preparationId, deliveryPreference: "download-only" })).toMatchObject({ outcome: "refused" });
    });
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


describe("save-picker owner binding", () => {
  for (const entry of ["public", "prepared"] as const) {
    for (const location of ["global", "window"] as const) {
      for (const outcome of ["completed", "cancelled"] as const) {
        test(`${entry} ${location} picker retains its owner when ${outcome}`, async () => {
          const { log } = scriptBlobGlobals();
          const writes: Uint8Array[] = [];
          const fallback = { showSaveFilePicker: function (this: unknown) { return invoke(this); } };
          const expectedOwner: unknown = location === "global" ? globalThis : fallback;
          function invoke(receiver: unknown) {
            log.push("picker");
            if (receiver !== expectedOwner) throw new TypeError("Illegal invocation");
            if (outcome === "cancelled") return Promise.reject(new DOMException("Cancelled", "AbortError"));
            return Promise.resolve({ createWritable: () => {
              log.push("open");
              return Promise.resolve({
                write: (bytes: Uint8Array) => { log.push("write"); writes.push(bytes); return Promise.resolve(); },
                close: () => { log.push("close"); return Promise.resolve(); },
              });
            } });
          }
          g.window = fallback;
          g.showSaveFilePicker = location === "global"
            ? function (this: unknown) { return invoke(this); }
            : undefined;
          const completion = entry === "public"
            ? deliverExportArtifact({ ...publicRequest(), preference: "prefer-file-system-access" })
            : readCompletion(startPreparedExportDelivery({ ...makeRequest(), preference: "prefer-file-system-access" }));
          expect(log).toEqual(["picker"]);
          const receipt: unknown = await completion;
          expect(receipt).toMatchObject({ ok: true, outcome, channel: "file-system-access", cleanup: "complete", outstandingOwnedResources: 0 });
          expect(log).toEqual(outcome === "completed" ? ["picker", "open", "write", "close"] : ["picker"]);
          expect(writes.length).toBe(outcome === "completed" ? 1 : 0);
          if (outcome === "completed") expect(Array.from(writes[0] ?? [])).toEqual(Array.from(BYTES));
        });
      }
    }
  }
});


describe("save-picker capability isolation", () => {
  for (const entry of ["public", "prepared"] as const) {
    const start = (preference: "download-only" | "prefer-file-system-access") => entry === "public"
      ? deliverExportArtifact({ ...publicRequest(), preference })
      : readCompletion(startPreparedExportDelivery({ ...makeRequest(), preference }));
    for (const field of ["showSaveFilePicker", "window"] as const) {
      for (const preference of ["download-only", "prefer-file-system-access"] as const) {
        test(`${entry} ${preference} isolates a throwing ${field} probe`, async () => {
          const { log } = scriptBlobGlobals();
          const descriptor = Object.getOwnPropertyDescriptor(globalThis, field);
          let probes = 0;
          Object.defineProperty(globalThis, field, { configurable: true, get: () => {
            probes += 1;
            throw new Error("PICKER_PROBE_FAILED");
          } });
          try {
            const pending = start(preference);
            expect(log).toEqual(preference === "download-only"
              ? ["create-url", "append", "click", "remove", "revoke-url"] : []);
            const result: unknown = await pending;
            expect(result).toMatchObject(preference === "download-only"
              ? { ok: true, outcome: "handed-off", channel: "object-url-download", objectUrlsCreated: 1, objectUrlsRevoked: 1 }
              : { ok: false, outcome: "failed", code: "export.delivery_capability_failed", channel: "file-system-access", objectUrlsCreated: 0, objectUrlsRevoked: 0 });
            expect(result).toMatchObject({ artifact: BINDING, cleanup: "complete", outstandingOwnedResources: 0 });
            expect(probes).toBe(preference === "download-only" ? 0 : 1);
          } finally {
            if (descriptor === undefined) Reflect.deleteProperty(globalThis, field);
            else Object.defineProperty(globalThis, field, descriptor);
          }
        });
      }
    }
    for (const timing of ["throw", "reject"] as const) {
      for (const errorKind of ["abort", "ordinary", "throwing-name"] as const) {
        test(`${entry} ${timing} picker ${errorKind} returns a safe terminal`, async () => {
          const { log } = scriptBlobGlobals();
          const error = errorKind === "abort" ? new DOMException("Cancelled", "AbortError")
            : errorKind === "ordinary" ? new Error("PICKER_FAILED")
              : Object.defineProperty(new Error("HOSTILE_NAME"), "name", { get: () => { throw new Error("NAME_FAILED"); } });
          g.showSaveFilePicker = () => {
            log.push("picker");
            if (timing === "throw") throw error;
            return Promise.reject(error);
          };
          const pending = start("prefer-file-system-access");
          expect(log).toEqual(["picker"]);
          const result: unknown = await pending;
          expect(result).toMatchObject({ ok: errorKind === "abort", outcome: errorKind === "abort" ? "cancelled" : "failed",
            channel: "file-system-access", artifact: BINDING, cleanup: "complete", objectUrlsCreated: 0,
            objectUrlsRevoked: 0, outstandingOwnedResources: 0 });
          if (errorKind !== "abort") expect(result).toMatchObject({ code: timing === "throw"
            ? "export.delivery_activation_failed" : "export.delivery_capability_failed" });
          expect(log).toEqual(["picker"]);
        });
      }
    }
  }
});
