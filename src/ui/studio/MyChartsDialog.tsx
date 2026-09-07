import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { StudioMyChartsService, StudioMyChartsView } from "../../application/runtime";
import { Button } from "../primitives";
import { Dialog } from "../overlays";

const COMMON = Object.freeze({ density: "comfortable", describedBy: [], invalid: false } as const);
const FOCUS = Object.freeze({ triggerId: "studio-my-charts-open", workflowTargetId: "studio-document-title", workspaceId: "workspace" });
const DISMISSIBLE = Object.freeze({ kind: "dismissible" } as const);
const WRITING = Object.freeze({ kind: "blocked", reason: "Wait for the local collection transaction to finish." } as const);

export function MyChartsDialog({ service, view }: Readonly<{ service: StudioMyChartsService; view: StudioMyChartsView }>) {
  const [search, setSearch] = useState(""), [title, setTitle] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const selected = view.records.find(row => row.recordId === view.selectedId);
  const onContractRefusal = useCallback(() => { service.invalidateHost(); }, [service]);
  useEffect(() => { setTitle(selected?.title ?? ""); }, [selected?.recordId, selected?.title]);
  useEffect(() => { if (!view.open) setSearch(""); }, [view.open]);
  useLayoutEffect(() => {
    if (view.confirmation !== null || view.restore !== null) heading.current?.focus();
  }, [view.confirmation, view.restore === null]);
  if (!view.open) return null;
  const writing = view.phase === "writing", ready = view.phase === "ready", busy = writing || view.phase === "loading";
  const shown = view.records.filter(row => `${row.title}\n${row.key}`.toLowerCase().includes(search.toLowerCase()));
  const action = (id: string, label: string, onAction: () => void, disabled = !ready, destructive = false) =>
    <Button {...COMMON} id={id} label={label} onAction={onAction} disabled={disabled} busy={false}
      type="button" variant={destructive ? "destructive" : "secondary"} />;
  return <Dialog {...COMMON} id="studio-my-charts-dialog" backgroundRootId="studio-shell-background"
    title="My Charts" description="Your own charts, kept locally with portable backups." closeLabel="Close My Charts"
    open busy={writing} disabled={false} dismissibility={writing ? WRITING : DISMISSIBLE} focusTargets={FOCUS}
    initialFocus="heading" initialFocusId={null} onDismiss={service.cancel} onContractRefusal={onContractRefusal}
    content={<div class="studio-my-charts">
      <p><strong>Kept in this browser.</strong> Download a backup to keep a portable copy.</p>
      <p>Keep captures the published chart. Unapplied edits and later changes are not included.</p>
      {view.message === null ? null : <p role={view.error ? "alert" : "status"}>{view.message}</p>}
      {view.confirmation !== null ? <section aria-labelledby="studio-my-charts-confirm-heading">
        <h3 ref={heading} tabIndex={-1} id="studio-my-charts-confirm-heading">{view.confirmation.kind === "remove" ? "Remove this kept copy?" : "Replace this kept copy?"}</h3>
        <p>{view.confirmation.kind === "remove" ? <>Remove <strong>{view.confirmation.keptTitle}</strong> from My Charts?</>
          : <>Replace <strong>{view.confirmation.keptTitle}</strong> with the current <strong>{view.confirmation.currentTitle}</strong>?</>}</p>
        <p>The chart being edited and its recovery remain unchanged.</p>
        <div class="studio-my-charts__actions">
          {action("studio-my-charts-confirm", view.confirmation.kind === "remove" ? "Confirm remove" : "Confirm replace", () => { void service.confirm(); }, !ready, true)}
          {action("studio-my-charts-confirm-cancel", "Keep the existing copy", service.cancelConfirmation, writing)}
        </div>
      </section> : null}
      {view.restore !== null ? <section aria-labelledby="studio-my-charts-restore-heading">
        <h3 ref={heading} tabIndex={-1} id="studio-my-charts-restore-heading">Restore backup preview</h3>
        <p>{view.restore.additions} additions · {view.restore.identical} already identical · {view.restore.conflicts.length} conflicts.</p>
        <p>Unaffected kept charts and the current chart stay as they are. Every choice is applied in one transaction.</p>
        {view.restore.conflicts.map((conflict, index) => <fieldset key={conflict.recordId} disabled={busy}>
          <legend>Choose the version for {conflict.localTitle}</legend>
          <label><input type="radio" name={`restore-${String(index)}`} checked={conflict.choice === "local"}
            onChange={() => { service.chooseConflict(conflict.recordId, "local"); }} /> Keep local copy: {conflict.localTitle}</label>
          <label><input type="radio" name={`restore-${String(index)}`} checked={conflict.choice === "backup"}
            onChange={() => { service.chooseConflict(conflict.recordId, "backup"); }} /> Use backup copy: {conflict.backupTitle}</label>
        </fieldset>)}
        <div class="studio-my-charts__actions">
          {action("studio-my-charts-restore-confirm", "Confirm restore", () => { void service.confirmRestore(); }, busy || view.restore.conflicts.some(row => row.choice === null))}
          {action("studio-my-charts-restore-cancel", "Cancel restore", service.cancelRestore, busy)}
        </div>
      </section> : <>
        <div class="studio-my-charts__actions">
          {action("studio-my-charts-keep", "Keep current chart", () => { void service.keepCurrent(); })}
          {action("studio-my-charts-refresh", "Refresh", () => { void service.refresh(); }, busy)}
        </div>
        <p>{view.records.length} of 128 charts · {(view.bytes / 1_048_576).toFixed(2)} of 32 MiB · displayed collection version {view.generation}</p>
        <label for="studio-my-charts-search">Search by title or key</label>
        <input id="studio-my-charts-search" type="search" value={search} maxLength={512} disabled={busy}
          onInput={event => { setSearch(event.currentTarget.value); }} />
        {view.records.length === 0 ? <p>{view.phase === "loading" ? "Reading My Charts…" : "No charts are kept here yet."}</p> : null}
        {shown.length === 0 && view.records.length > 0 ? <p>No matching charts.</p> : null}
        <ul class="studio-my-charts__list" aria-label="Kept charts">
          {shown.map(row => <li key={row.recordId}><button type="button" class="studio-my-charts__row"
            aria-pressed={row.recordId === view.selectedId} disabled={busy} onClick={() => { service.select(row.recordId); }}>
            <strong>{row.title}</strong><span>{row.key} · Last kept {new Date(row.updatedAt).toLocaleString()}</span>
          </button></li>)}
        </ul>
        {selected === undefined ? null : <section aria-labelledby="studio-my-charts-selected-heading">
          <h3 id="studio-my-charts-selected-heading">Selected: {selected.title}</h3>
          <div class="studio-my-charts__actions">
            {action("studio-my-charts-load", "Open chart…", () => { void service.openSelected(); })}
            {action("studio-my-charts-duplicate", "Duplicate", () => { void service.duplicate(); })}
            {action("studio-my-charts-replace", "Replace with current chart…", service.requestReplace)}
            {action("studio-my-charts-remove", "Remove…", service.requestRemove, !ready, true)}
            {action("studio-my-charts-download-selected", "Download chart JSON", service.downloadSelected, busy || !view.chartDownloadReady)}
          </div>
          <form onSubmit={event => { event.preventDefault(); void service.rename(title); }}>
            <label for="studio-my-charts-title">Rename the kept copy</label>
            <input id="studio-my-charts-title" value={title} maxLength={512} disabled={!ready}
              onInput={event => { setTitle(event.currentTarget.value); }} />
            <p>The title in the chart being edited stays unchanged.</p>
            <Button {...COMMON} id="studio-my-charts-rename" label="Rename kept chart" type="submit" variant="secondary"
              disabled={!ready} busy={false} onAction={() => { /* The form owns submission. */ }} />
          </form>
        </section>}
        <section aria-labelledby="studio-my-charts-backup-heading">
          <h3 id="studio-my-charts-backup-heading">Portable copies</h3>
          <p>Downloads contain the displayed kept snapshots, including annotations and exact notes. Refresh to read changes made in another tab.</p>
          <div class="studio-my-charts__actions">
            {action("studio-my-charts-backup", "Download backup", service.downloadBackup, busy || !view.backupReady)}
            {action("studio-my-charts-current-json", "Download current chart JSON", service.downloadCurrent, writing)}
          </div>
          <label for="studio-my-charts-restore-file">Restore backup</label>
          <input id="studio-my-charts-restore-file" type="file" accept=".json,.changes-library.json,application/json" disabled={!ready}
            onChange={event => {
              const file = event.currentTarget.files?.[0];
              if (file !== undefined) void service.previewBackup(file);
              event.currentTarget.value = "";
            }} />
        </section>
      </>}
    </div>} />;
}
