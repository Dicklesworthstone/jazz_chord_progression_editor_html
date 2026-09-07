import { createProductionStableIdFactory, type StableIdFactory } from "../domain";
import { MY_CHARTS_LIMITS, checkStoredCharts, isMyChartsRecordId, type MyChartsFailureCode, type MyChartsSnapshot, type MyChartsStorage } from "../persistence";
import type { DialogDescriptor } from "./application-state-contract";
import { decodeKeptCharts, decodeMyChartsBackup, duplicateKeptChart, encodeMyChartsBackup, keepChartDocument,
  planMyChartsRestore, renameKeptChart, resolveMyChartsRestore,
  type KeptChart, type MyChartsConflictChoice, type MyChartsRestorePlan } from "./my-charts";
import type { StudioComposition } from "./studio-controller";
import type { StudioDocumentImport } from "./studio-document-import";
import type { StudioLifecycleService } from "./studio-lifecycle";

const DIALOG_ID = "studio-my-charts";
export type MyChartsRowView = Readonly<{ recordId: string; title: string; key: string; updatedAt: string }>;
export type StudioMyChartsView = Readonly<{
  open: boolean; phase: "loading" | "ready" | "writing" | "failed" | "restore";
  records: readonly MyChartsRowView[]; selectedId: string | null; bytes: number; generation: number;
  message: string | null; error: boolean; backupReady: boolean; chartDownloadReady: boolean;
  confirmation: Readonly<{ kind: "remove" | "replace"; keptTitle: string; currentTitle: string | null }> | null;
  restore: Readonly<{ additions: number; identical: number; conflicts: readonly Readonly<{
    recordId: string; localTitle: string; backupTitle: string; choice: MyChartsConflictChoice | null;
  }>[] }> | null;
}>;
export type StudioMyChartsService = Readonly<{
  getSnapshot: () => StudioMyChartsView; subscribe: (listener: () => void) => () => void;
  open: () => void; cancel: () => void; invalidateHost: () => void; refresh: () => Promise<void>;
  select: (recordId: string) => void; keepCurrent: () => Promise<void>; rename: (title: string) => Promise<void>;
  duplicate: () => Promise<void>; requestRemove: () => void; requestReplace: () => void;
  cancelConfirmation: () => void; confirm: () => Promise<void>; openSelected: () => Promise<void>;
  previewBackup: (file: File) => Promise<void>; chooseConflict: (recordId: string, choice: MyChartsConflictChoice) => void;
  cancelRestore: () => void; confirmRestore: () => Promise<void>;
  downloadBackup: () => void; downloadSelected: () => void; downloadCurrent: () => void;
}>;

const messages: Record<MyChartsFailureCode, string> = {
  "my-charts.unavailable": "My Charts is unavailable in this browser. You can still edit and download the current chart as JSON.",
  "my-charts.quota": "Browser storage is full. Previously kept charts are preserved. Download JSON or a backup; no charts were evicted.",
  "my-charts.aborted": "The storage transaction was cancelled. Previously kept charts are preserved.",
  "my-charts.corrupt": "My Charts contains an unreadable index or record. It has been preserved. You can still download the current chart as JSON.",
  "my-charts.conflict": "My Charts changed in another tab. Refresh and try again. This attempt did not overwrite its changes.",
  "my-charts.generation_exhausted": "This collection cannot accept another version. Download a backup.",
  "my-charts.record_limit": "My Charts holds at most 128 charts. No existing charts were removed. Download JSON or a backup.",
  "my-charts.document_limit": "This chart exceeds the 2 MiB JSON limit. The collection is unchanged.",
  "my-charts.collection_limit": "This collection would exceed 32 MiB. No charts were removed. Download individual chart JSON files.",
  "my-charts.backup_limit": "The backup exceeds its 64 MiB plus 128 KiB limit. Download individual chart JSON files.",
  "my-charts.invalid_backup": "This backup is unreadable or uses an unsupported format. Nothing was restored.",
  "my-charts.invalid_document": "A chart could not pass exact document validation. Nothing was restored or repaired.",
  "my-charts.identity_failed": "A fresh chart identity could not be allocated. Nothing was duplicated or replaced.",
  "my-charts.invalid_title": "Enter a nonblank title of at most 256 Unicode code points. The kept title is unchanged.",
  "my-charts.unresolved_conflict": "Choose Keep local copy or Use backup copy for every conflicting chart before restoring.",
};
function project(row: KeptChart): MyChartsRowView {
  const key = row.document.key;
  return Object.freeze({ recordId: row.recordId, title: row.document.title, updatedAt: row.updatedAt,
    key: key === null ? "No key" : `${key.tonic.step}${key.tonic.alter < 0 ? "b".repeat(-key.tonic.alter) : "#".repeat(key.tonic.alter)} ${key.mode}` });
}

/** Collection writes carry no live document mutation channel. Only Open hands
 * its exact JSON to the existing E0/U5 preview and serialized replacement. */
export function createStudioMyCharts(options: Readonly<{
  composition: StudioComposition; storage: MyChartsStorage; documentImport: StudioDocumentImport;
  lifecycle: StudioLifecycleService; nowIso: () => string;
  prepareDownload: (text: string, filename: string) => () => boolean;
  idFactory?: StableIdFactory;
}>): StudioMyChartsService {
  const { composition } = options, ids = options.idFactory ?? createProductionStableIdFactory();
  const listeners = new Set<() => void>();
  let owner: DialogDescriptor | null = null, operation: AbortController | null = null;
  let snapshot: MyChartsSnapshot | null = null, records: readonly KeptChart[] = [];
  let backup: (() => boolean) | null = null, selectedDownload: (() => boolean) | null = null;
  let restorePlan: MyChartsRestorePlan | null = null;
  const choices = new Map<string, MyChartsConflictChoice>();
  let confirmation: Readonly<{ recordId: string; kind: "remove" | "replace";
    bound: ReturnType<StudioComposition["readApplicationState"]> }> | null = null;
  let view: StudioMyChartsView = Object.freeze({ open: false, phase: "loading", records: [], selectedId: null,
    bytes: 0, generation: 0, message: null, error: false, backupReady: false, chartDownloadReady: false, confirmation: null, restore: null });
  const top = () => composition.readApplicationState().dialogs.at(-1);
  const hosted = () => owner !== null && top() === owner;
  const writable = () => hosted() && operation === null && snapshot !== null && view.phase === "ready";
  const selected = () => records.find(row => row.recordId === view.selectedId);
  function publish(patch: Partial<StudioMyChartsView>): void {
    view = Object.freeze({ ...view, ...patch, backupReady: backup !== null, chartDownloadReady: selectedDownload !== null });
    for (const listener of listeners) listener();
  }
  function fail(code: MyChartsFailureCode): void {
    confirmation = null; restorePlan = null; choices.clear();
    const fatal = code === "my-charts.corrupt" || code === "my-charts.conflict" || code === "my-charts.unavailable";
    if (fatal) { snapshot = null; backup = null; }
    publish({ phase: fatal ? "failed" : "ready", error: true, message: messages[code], confirmation: null, restore: null });
  }
  function prepareSelected(): void {
    selectedDownload = null;
    const row = selected();
    if (row === undefined) return;
    try { selectedDownload = options.prepareDownload(row.documentText, "kept-chart.changes.json"); }
    catch { /* The current chart's existing lifecycle export remains available. */ }
  }
  function prepareDownloads(): void {
    backup = null; prepareSelected();
    if (snapshot === null) return;
    const encoded = encodeMyChartsBackup(records);
    if (!encoded.ok) { publish({ message: messages[encoded.code], error: true }); return; }
    try { backup = options.prepareDownload(encoded.value, "my-charts.changes-library.json"); }
    catch { publish({ message: "The backup could not be prepared. Download individual chart JSON files.", error: true }); }
  }
  function retire(): void {
    operation?.abort(); operation = null; owner = null; snapshot = null; records = [];
    backup = null; selectedDownload = null; restorePlan = null; confirmation = null; choices.clear();
    publish({ open: false, records: [], selectedId: null, confirmation: null, restore: null, message: null });
  }
  function cancel(): boolean {
    if (!hosted() || view.phase === "writing") return false;
    if (!composition.replacementWorkflow.applyLifecycleIntent({ kind: "pop-dialog", dialogId: DIALOG_ID }).ok) return false;
    retire(); return true;
  }
  composition.controller.subscribe(() => { if (owner !== null && top() !== owner) retire(); });
  async function refresh(): Promise<void> {
    if (!hosted() || view.phase === "writing") return;
    operation?.abort(); const pending = new AbortController(); operation = pending;
    snapshot = null; backup = null; selectedDownload = null; confirmation = null; restorePlan = null; choices.clear();
    publish({ phase: "loading", message: null, error: false, confirmation: null, restore: null });
    try {
      const result = await options.storage.read(pending.signal);
      if (operation !== pending || !hosted()) return;
      operation = null;
      if (!result.ok) { fail(result.code); return; }
      const decoded = decodeKeptCharts(result.value.records);
      if (!decoded.ok) { fail("my-charts.corrupt"); return; }
      snapshot = result.value; records = decoded.value;
      updateRecords();
    } catch { if (operation === pending && hosted()) { operation = null; fail("my-charts.unavailable"); } }
  }
  function updateRecords(message: string | null = null): void {
    const counts = checkStoredCharts(records);
    const selectedId = records.some(row => row.recordId === view.selectedId) ? view.selectedId : null;
    const rows = records.map(project).sort((a, b) => a.updatedAt !== b.updatedAt ? (a.updatedAt > b.updatedAt ? -1 : 1)
      : a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0);
    publish({ phase: "ready", records: Object.freeze(rows), selectedId, bytes: counts.ok ? counts.value : 0,
      generation: snapshot?.generation ?? 0, message, error: false, confirmation: null, restore: null });
    prepareDownloads(); publish({});
  }
  function newRecordId(): string | null {
    const result = ids.next("document");
    const recordId = result.ok ? `chart_${result.value}` : null;
    return isMyChartsRecordId(recordId) && !records.some(row => row.recordId === recordId) ? recordId : null;
  }
  async function write(next: readonly KeptChart[], message: string): Promise<void> {
    if (!hosted() || snapshot === null || operation !== null) return;
    const pending = new AbortController(), expected = snapshot; operation = pending;
    backup = null; selectedDownload = null; confirmation = null; restorePlan = null; choices.clear();
    publish({ phase: "writing", message: "Keeping changes in this browser…", error: false, confirmation: null, restore: null });
    try {
      const result = await options.storage.compareAndSwap(expected, next, pending.signal);
      if (operation !== pending || !hosted()) return;
      operation = null;
      if (!result.ok) { fail(result.code); prepareDownloads(); publish({}); return; }
      snapshot = result.value; records = next;
      updateRecords(message);
    } catch {
      if (operation === pending && hosted()) { operation = null; snapshot = null;
        publish({ phase: "failed", message: "The storage result could not be confirmed. Refresh My Charts before trying again.", error: true }); }
    }
  }
  function requestConfirmation(kind: "remove" | "replace"): void {
    const row = selected(); if (!writable() || row === undefined) return;
    const bound = composition.readApplicationState();
    confirmation = { kind, recordId: row.recordId, bound };
    publish({ confirmation: { kind, keptTitle: row.document.title, currentTitle: kind === "replace" ? bound.document.title : null }, message: null, error: false });
  }
  function restoreView(): void {
    const plan = restorePlan; if (plan === null) return;
    publish({ phase: "restore", restore: { additions: plan.additions.length, identical: plan.identical.length,
      conflicts: plan.conflicts.map(recordId => ({ recordId, localTitle: plan.local.find(row => row.recordId === recordId)?.document.title ?? "",
        backupTitle: plan.incoming.find(row => row.recordId === recordId)?.document.title ?? "", choice: choices.get(recordId) ?? null })) } });
  }
  function download(kind: "backup" | "selected"): void {
    if (!hosted() || operation !== null || view.phase === "restore") return;
    const start = kind === "backup" ? backup : selectedDownload;
    if (start === null) return;
    if (kind === "backup") backup = null; else selectedDownload = null;
    let issued = false;
    try { issued = start(); } catch { /* Native activation/cleanup refusal is visible. */ }
    publish({ message: issued ? "Download started for the displayed kept snapshot. Check your downloads for the portable file."
      : "Download could not be confirmed. Refresh or select the chart again, then try another download.", error: !issued });
  }
  return Object.freeze({
    getSnapshot: () => view,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    open: () => {
      if (owner !== null || composition.readApplicationState().dialogs.length > 0) return;
      const result = composition.replacementWorkflow.applyLifecycleIntent({ kind: "push-dialog", dialog: {
        id: DIALOG_ID, kind: "my-charts", phase: "open", blocksHistory: false, requestId: null,
      } });
      if (!result.ok) return;
      owner = top() ?? null; publish({ open: true, phase: "loading" }); void refresh();
    },
    cancel, refresh,
    invalidateHost: () => {
      const wasHosted = hosted(); retire();
      if (wasHosted) composition.replacementWorkflow.applyLifecycleIntent({ kind: "pop-dialog", dialogId: DIALOG_ID });
    },
    select: recordId => {
      if (!hosted() || operation !== null || restorePlan !== null || !records.some(row => row.recordId === recordId)) return;
      confirmation = null; publish({ selectedId: recordId, confirmation: null }); prepareSelected(); publish({});
    },
    keepCurrent: async () => {
      if (!writable()) return;
      const bound = composition.readApplicationState(), id = newRecordId();
      if (id === null) { fail("my-charts.identity_failed"); return; }
      const kept = keepChartDocument(bound.document, id, options.nowIso());
      if (!kept.ok) { fail(kept.code); return; }
      await write([...records, kept.value], `Kept “${bound.document.title}” in this browser at chart revision ${String(bound.revision)}. Later edits are not included.`);
    },
    rename: async title => {
      const row = selected(); if (!writable() || row === undefined) return;
      const renamed = renameKeptChart(row, title, options.nowIso());
      if (!renamed.ok) { fail(renamed.code); return; }
      await write(records.map(value => value.recordId === row.recordId ? renamed.value : value), "Renamed the kept copy. The chart being edited is unchanged.");
    },
    duplicate: async () => {
      const row = selected(); if (!writable() || row === undefined) return;
      const id = newRecordId(); if (id === null) { fail("my-charts.identity_failed"); return; }
      const copied = duplicateKeptChart(row, id, options.nowIso(), ids);
      if (!copied.ok) { fail(copied.code); return; }
      await write([...records, copied.value], "Duplicated the kept chart with fresh identities. All notes, spellings and durations are preserved.");
    },
    requestRemove: () => { requestConfirmation("remove"); }, requestReplace: () => { requestConfirmation("replace"); },
    cancelConfirmation: () => { confirmation = null; publish({ confirmation: null }); },
    confirm: async () => {
      const chosen = confirmation; if (!writable() || chosen === null) return;
      const current = composition.readApplicationState();
      if (chosen.kind === "replace" && (current.document !== chosen.bound.document || current.revision !== chosen.bound.revision)) {
        confirmation = null; publish({ confirmation: null, message: "The current chart changed. Review Replace with current chart again before confirming.", error: true }); return;
      }
      if (chosen.kind === "remove") { await write(records.filter(row => row.recordId !== chosen.recordId), "Removed the kept copy. The current chart and recovery are unchanged."); return; }
      const kept = keepChartDocument(chosen.bound.document, chosen.recordId, options.nowIso());
      if (!kept.ok) { fail(kept.code); return; }
      await write(records.map(row => row.recordId === chosen.recordId ? kept.value : row), `Replaced the kept copy with chart revision ${String(chosen.bound.revision)}.`);
    },
    openSelected: async () => {
      const row = selected(); if (!writable() || row === undefined) return;
      const text = row.documentText;
      if (!cancel()) return;
      options.documentImport.open();
      await options.documentImport.previewPaste(text, "canonical-json");
    },
    previewBackup: async file => {
      if (!writable()) return;
      const pending = new AbortController(), selectedOwner = owner; operation = pending;
      confirmation = null; restorePlan = null; choices.clear();
      publish({ phase: "loading", message: "Reading backup for preview…", confirmation: null, restore: null, error: false });
      try {
        const bytes = new Uint8Array(await file.slice(0, MY_CHARTS_LIMITS.backupBytes + 1).arrayBuffer());
        if (operation !== pending || !hosted()) return;
        operation = null;
        if (bytes.length > MY_CHARTS_LIMITS.backupBytes) { fail("my-charts.backup_limit"); return; }
        if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) { fail("my-charts.invalid_backup"); return; }
        const decoded = decodeMyChartsBackup(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        if (!decoded.ok) { fail(decoded.code); return; }
        restorePlan = planMyChartsRestore(records, decoded.value);
        publish({ message: "Review this backup. Nothing has been restored yet.", error: false }); restoreView();
      } catch { if (owner === selectedOwner && hosted() && (operation === pending || operation === null)) { operation = null; fail("my-charts.invalid_backup"); } }
    },
    chooseConflict: (recordId, choice) => { if (hosted() && restorePlan?.conflicts.includes(recordId) === true && operation === null) {
      choices.set(recordId, choice); restoreView();
    } },
    cancelRestore: () => { if (!hosted() || operation !== null) return; restorePlan = null; choices.clear(); publish({ phase: "ready", restore: null, message: null }); },
    confirmRestore: async () => {
      if (!hosted() || operation !== null || restorePlan === null || snapshot === null) return;
      const resolved = resolveMyChartsRestore(restorePlan, choices);
      if (!resolved.ok) { publish({ message: messages[resolved.code], error: true }); return; }
      await write(resolved.value, "Restored the complete confirmed collection in this browser. The current chart is unchanged.");
    },
    downloadBackup: () => { download("backup"); }, downloadSelected: () => { download("selected"); },
    downloadCurrent: () => { if (cancel()) void options.lifecycle.openExport(); },
  });
}
