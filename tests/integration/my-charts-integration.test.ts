import { expect, test } from "bun:test";
import fixture from "../fixtures/exact-share/document.changes.json";
import { createStudioBootstrap, createStudioCompositionOverState, createStudioDocumentImport,
  createX1SerializedTransportRetirementAdapter } from "../../src/application";
import { createStudioLifecycle } from "../../src/application/studio-lifecycle";
import { createStudioMyCharts } from "../../src/application/studio-my-charts";
import { applyExactSharedStartup } from "../../src/application/exact-share-startup";
import { createRecoveryHarness } from "../support/recovery-test-kit";
import { createTransportHarness } from "../support/transport-test-kit";
import { checkStoredCharts, type MyChartsSnapshot, type MyChartsStorage } from "../../src/persistence";

/** Deliberately small port control for application lifetimes. Native storage
 * transaction behavior is proved separately in my-charts.spec.ts. */
function memoryPort() {
  let state: MyChartsSnapshot = { token: null, generation: 0, records: [] };
  const port: MyChartsStorage = {
    read: () => Promise.resolve({ ok: true, value: state }),
    compareAndSwap: (expected, records, signal) => {
      if (signal?.aborted === true) return Promise.resolve({ ok: false, code: "my-charts.aborted" });
      if (expected.token !== state.token) return Promise.resolve({ ok: false, code: "my-charts.conflict" });
      const checked = checkStoredCharts(records); if (!checked.ok) return Promise.resolve(checked);
      state = { token: String(state.generation + 1), generation: state.generation + 1, records };
      return Promise.resolve({ ok: true, value: state });
    },
  };
  return { port, inspect: () => state };
}
async function harness(storage?: MyChartsStorage) {
  const bootstrap = createStudioBootstrap(); if (!bootstrap.ok) throw new Error("bootstrap refused");
  const composition = createStudioCompositionOverState(bootstrap.value.state, bootstrap.value.dependencies, { nowMs: () => 12000 });
  const recovery = createRecoveryHarness(), transport = createTransportHarness();
  const retirement = createX1SerializedTransportRetirementAdapter(transport.service, transport.nextRequestId, {
    beforeSubmit: composition.replacementWorkflow.expectTransportRetirement, settled: composition.replacementWorkflow.settleTransportRetirement,
  });
  let currentDeliveries = 0;
  const lifecycle = createStudioLifecycle({ composition, recovery: recovery.service,
    hashBytes: bytes => Promise.resolve(new Bun.CryptoHasher("sha256").update(bytes).digest("hex")), nowIso: () => "2026-09-07T00:00:00.000Z",
    startDelivery: () => { currentDeliveries++; throw new Error("No current export authorized"); },
  });
  const importer = createStudioDocumentImport({ composition, recovery: recovery.service, retirement, exportCurrent: () => { void lifecycle.openExport(); } });
  const loaded = await applyExactSharedStartup(composition, importer, JSON.stringify(fixture));
  if (!loaded.applied) throw new Error(loaded.reason);
  const stored = memoryPort(), files: { text: string; filename: string }[] = [];
  const service = createStudioMyCharts({ composition, lifecycle, documentImport: importer, storage: storage ?? stored.port,
    nowIso: () => "2026-09-07T00:00:00.000Z", prepareDownload: (text, filename) => () => { files.push({ text, filename }); return true; },
  });
  return { composition, controller: composition.controller, service, stored, files, importer, lifecycle, currentDeliveries: () => currentDeliveries };
}
async function open(h: Awaited<ReturnType<typeof harness>>) {
  h.service.open();
  for (let n = 0; n < 20 && h.service.getSnapshot().phase === "loading"; n++) await Promise.resolve();
  expect(h.service.getSnapshot().phase).toBe("ready");
}
function selectedId(h: Awaited<ReturnType<typeof harness>>) {
  const id = h.service.getSnapshot().records[0]?.recordId;
  if (id === undefined) throw new Error("Missing kept chart");
  h.service.select(id); return id;
}

test("Keep, rename, duplicate, both downloads and remove preserve live document/history/recovery", async () => {
  const h = await harness(), before = h.composition.readApplicationState(); await open(h);
  await h.service.keepCurrent(); const id = selectedId(h);
  expect(h.stored.inspect().records[0]?.documentText).toContain('"id": "share-document-exact"');
  await h.service.rename("Kept title only");
  expect(h.service.getSnapshot().records[0]?.title).toBe("Kept title only");
  expect(h.composition.readApplicationState().document).toBe(before.document);
  await h.service.duplicate(); expect(h.service.getSnapshot().records).toHaveLength(2);
  const musicalIds = h.stored.inspect().records.map(row => { const parsed: unknown = JSON.parse(row.documentText); return parsed; });
  expect(musicalIds[0]).not.toEqual(musicalIds[1]);
  h.service.select(id); h.service.downloadSelected(); h.service.downloadSelected();
  h.service.downloadBackup(); h.service.downloadBackup();
  expect(h.files).toHaveLength(2); expect(h.currentDeliveries()).toBe(0);
  h.service.requestRemove(); expect(h.service.getSnapshot().confirmation?.kind).toBe("remove");
  expect(h.stored.inspect().records).toHaveLength(2);
  await h.service.confirm(); expect(h.stored.inspect().records).toHaveLength(1);
  h.service.cancel();
  const after = h.composition.readApplicationState();
  expect(after.document).toBe(before.document); expect(after.history).toBe(before.history);
  expect(after.recovery).toBe(before.recovery); expect(after.transport).toBe(before.transport);
  expect(after.exportRevision).toBe(before.exportRevision); expect(after.bookmarks).toBe(before.bookmarks);
});

test("Replace requires current revision consent and a newer edit invalidates that consent", async () => {
  const h = await harness(); await open(h); await h.service.keepCurrent(); selectedId(h);
  h.service.requestReplace(); expect(h.controller.setTitle("New current title").ok).toBe(true);
  await h.service.confirm(); expect(h.service.getSnapshot().message).toContain("current chart changed");
  expect(h.service.getSnapshot().records[0]?.title).toBe(fixture.title);
  h.service.requestReplace(); await h.service.confirm();
  expect(h.service.getSnapshot().records[0]?.title).toBe("New current title");
});

test("Open delegates to the actual E0/U5 preview and one undoable replacement", async () => {
  const h = await harness(); await open(h); await h.service.keepCurrent(); selectedId(h);
  await h.service.rename("Open this kept title");
  const before = h.composition.readApplicationState(); await h.service.openSelected();
  expect(h.service.getSnapshot().open).toBe(false); expect(h.importer.getSnapshot().phase).toBe("preview");
  expect(h.composition.readApplicationState().document).toBe(before.document);
  await h.importer.requestCommit();
  if (h.importer.getSnapshot().phase === "confirm") await h.importer.confirm(false);
  expect(h.composition.readApplicationState().document.title).toBe("Open this kept title");
  expect(h.composition.readApplicationState().history.undo.length).toBe(before.history.undo.length + 1);
  expect(h.controller.undo().ok).toBe(true); expect(h.composition.readApplicationState().document).toEqual(before.document);
});

test("restore is preview-only until explicit conflict decisions and atomic confirmation", async () => {
  const h = await harness(); await open(h); await h.service.keepCurrent(); selectedId(h); h.service.downloadBackup();
  const text = h.files[0]?.text; if (text === undefined) throw new Error("No backup");
  await h.service.rename("Local newer title"); const before = h.stored.inspect();
  await h.service.previewBackup(new File([text], "backup.changes-library.json"));
  expect(h.service.getSnapshot().restore?.conflicts).toHaveLength(1);
  await h.service.confirmRestore(); expect(h.stored.inspect()).toBe(before);
  const id = h.service.getSnapshot().restore?.conflicts[0]?.recordId; if (id === undefined) throw new Error("No conflict preview");
  h.service.chooseConflict(id, "backup"); await h.service.confirmRestore();
  expect(h.service.getSnapshot().records[0]?.title).toBe(fixture.title);
  const actual: unknown = h.composition.readApplicationState().document;
  expect(actual).toEqual(fixture);
});

test("a stale tab cannot silently rebase or overwrite another collection writer", async () => {
  const shared = memoryPort(), a = await harness(shared.port), b = await harness(shared.port);
  await open(a); await open(b); await a.service.keepCurrent(); const committed = shared.inspect();
  await b.service.keepCurrent(); expect(shared.inspect()).toBe(committed);
  expect(b.service.getSnapshot().phase).toBe("failed"); expect(b.service.getSnapshot().message).toContain("another tab");
  expect(b.service.getSnapshot().backupReady).toBe(false);
  await b.service.refresh(); expect(b.service.getSnapshot().records).toHaveLength(1);
});

test("denied storage keeps the real current-document export escape available", async () => {
  const h = await harness({ read: () => Promise.resolve({ ok: false, code: "my-charts.unavailable" }),
    compareAndSwap: () => { throw new Error("Unavailable storage must never receive writes"); } });
  h.service.open(); for (let n = 0; n < 20 && h.service.getSnapshot().phase === "loading"; n++) await Promise.resolve();
  expect(h.service.getSnapshot().phase).toBe("failed"); h.service.downloadCurrent();
  expect(h.service.getSnapshot().open).toBe(false);
  expect(h.composition.readApplicationState().dialogs.at(-1)?.kind).toBe("lifecycle-export");
});

test("retired read and write completions cannot reopen a newer dialog", async () => {
  const actual = memoryPort(); let release: (() => void) | undefined;
  const delayed: MyChartsStorage = { ...actual.port, compareAndSwap: async (...args) => {
    await new Promise<void>(resolve => { release = resolve; }); return actual.port.compareAndSwap(...args);
  } };
  const h = await harness(delayed); await open(h);
  const pending = h.service.keepCurrent(); expect(h.service.getSnapshot().phase).toBe("writing");
  h.service.cancel(); expect(h.service.getSnapshot().open).toBe(true); // Busy transaction cannot be dismissed.
  h.service.invalidateHost(); expect(h.service.getSnapshot().open).toBe(false);
  await open(h); release?.(); await pending;
  expect(h.service.getSnapshot().records).toHaveLength(0); expect(actual.inspect().records).toHaveLength(0);
  expect(h.service.getSnapshot().message).toBeNull(); expect(h.service.getSnapshot().phase).toBe("ready");
});

for (const bytes of [new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]), new Uint8Array([0xff, 0xfe])]) {
  test("actual File byte decoding refuses BOM or malformed UTF-8 without touching the collection", async () => {
    const h = await harness(); await open(h); await h.service.keepCurrent(); const before = h.stored.inspect();
    await h.service.previewBackup(new File([bytes], "invalid.json"));
    expect(h.service.getSnapshot().error).toBe(true); expect(h.stored.inspect()).toBe(before);
    expect(h.service.getSnapshot().restore).toBeNull();
  });
}
