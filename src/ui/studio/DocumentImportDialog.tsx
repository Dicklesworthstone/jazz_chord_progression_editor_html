import { useCallback, useEffect, useState } from "preact/hooks";
import type { StudioDocumentImport, StudioImportFormatHint, StudioImportView } from "../../application/runtime";
import type { UiDiagnostic } from "../ui-contract";
import { Button, Checkbox, Select, Textarea } from "../primitives";
import { Dialog } from "../overlays";

const DISMISSIBLE = Object.freeze({ kind: "dismissible" } as const);
const COMMITTING = Object.freeze({ kind: "blocked", reason: "Wait for the chart replacement to finish." } as const);
const FOCUS = Object.freeze({ triggerId: "studio-import-chart", workflowTargetId: "studio-document-title", workspaceId: "workspace" });
const FORMAT_OPTIONS = [
  { id: "import-format-auto", value: "auto", label: "Detect format", description: null, disabled: false },
  { id: "import-format-json", value: "canonical-json", label: "Changes JSON", description: null, disabled: false },
  { id: "import-format-legacy", value: "legacy-json", label: "Legacy JSON", description: null, disabled: false },
  { id: "import-format-text", value: "chart-text", label: "Chart text (insert only)", description: null, disabled: false },
] as const;
const COMMON = { density: "comfortable", describedBy: [], invalid: false } as const;

export function DocumentImportDialog({ service, view }: Readonly<{ service: StudioDocumentImport; view: StudioImportView }>) {
  const [text, setText] = useState("");
  const [hint, setHint] = useState<StudioImportFormatHint>("auto");
  const [acknowledged, setAcknowledged] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  useEffect(() => { if (view.phase !== "confirm") setAcknowledged(false); }, [view.phase]);
  const onContractRefusal = useCallback((diagnostic: UiDiagnostic) => {
    setRefusal(`${diagnostic.code}: ${diagnostic.message}`);
    service.cancel();
  }, [service]);
  if (!view.open) return refusal === null && view.message === null ? null
    : <p role={refusal === null ? "status" : "alert"}>{refusal ?? view.message}</p>;
  const busy = view.phase === "committing";
  const confirm = view.phase === "confirm" || busy;
  return <Dialog backgroundRootId="studio-shell-background" id="studio-document-import-dialog"
    title={confirm ? "Replace the current chart?" : "Import a chart"}
    description={confirm ? "Review what changes before confirming." : "Choose a local file or paste JSON. Previewing never replaces the current chart."}
    closeLabel="Cancel import" open busy={busy} disabled={false} {...COMMON}
    dismissibility={busy ? COMMITTING : DISMISSIBLE} focusTargets={FOCUS} initialFocus="heading" initialFocusId={null}
    onContractRefusal={onContractRefusal} onDismiss={service.cancel}
    content={<div class="studio-document-import">
      {confirm ? <>
        <p>Replace the current chart with <strong>{view.title}</strong> from {view.sourceFormat === "unversioned-legacy-json" ? "legacy import" : "Changes JSON import"}?</p>
        <p>The incoming chart keeps its notes, spellings, durations, sections and settings. Playback will stop before replacement. Current edits and selections will be replaced.</p>
        {view.nonUndoable ? <>
          <p role="alert">History is at its boundary. This replacement cannot be undone. Export your current chart before continuing.</p>
          <Checkbox {...COMMON} id="studio-import-nonundoable" busy={busy} disabled={busy}
            label="I understand this replacement cannot be undone" checked={acknowledged}
            onCheckedChange={(event) => { setAcknowledged(event.value); }} />
        </> : <p>Undo can restore the previous chart.</p>}
        {view.exportRecommended ? <Button {...COMMON} id="studio-import-export-first" busy={false} disabled={busy} type="button"
          label="Export current chart first" variant="secondary" onAction={service.exportCurrentFirst} /> : null}
        <Button {...COMMON} id="studio-import-confirm" type="button" variant="destructive" busy={busy}
          disabled={busy || (view.nonUndoable && !acknowledged)} label={busy ? "Replacing chart…" : "Confirm replacement"}
          onAction={() => { void service.confirm(acknowledged); }} />
        <Button {...COMMON} id="studio-import-back" type="button" variant="secondary" busy={false} disabled={busy}
          label="Back to preview" onAction={service.backToPreview} />
      </> : <>
        <Select {...COMMON} id="studio-import-format" accessibleName="Import format" busy={false} disabled={view.phase === "reading"}
          options={FORMAT_OPTIONS} value={hint} onValueChange={(event) => { setHint(event.value); service.invalidatePreview(); }} />
        <label for="studio-import-file">Choose a chart file (up to 2 MiB)</label>
        <input id="studio-import-file" type="file" accept=".json,.txt,application/json,text/plain" disabled={view.phase === "reading"}
          onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file !== undefined) void service.previewFile(file, hint); event.currentTarget.value = ""; }} />
        <div onPaste={(event) => {
          // Clipboard payload crosses the application byte limit directly;
          // the owned text widget retains only its reviewed 4096-codepoint draft.
          const pasted = event.clipboardData?.getData("text/plain");
          if (pasted === undefined) return;
          event.preventDefault();
          setText("");
          void service.previewPaste(pasted, hint);
        }}>
          <Textarea {...COMMON} id="studio-import-paste" accessibleName="Paste chart JSON or text" busy={false}
            disabled={view.phase === "reading"} readOnly={false} placeholder="Paste to preview; type short input and press Preview text."
            value={text} rows={4} maxCodePoints={4096} onValueChange={(event) => { setText(event.value); service.invalidatePreview(); }} />
        </div>
        <Button {...COMMON} id="studio-import-preview-text" busy={view.phase === "reading"} disabled={text.length === 0 || view.phase === "reading"}
          type="button" variant="secondary" label="Preview text" onAction={() => { void service.previewPaste(text, hint); }} />
        {view.phase === "reading" ? <p role="status">Reading and validating the chart…</p> : null}
        {view.summary === null ? null : <section aria-label="Import preview">
          <h3>{view.title}</h3>
          <p>{view.summary.sections} sections; {view.summary.measures} measures; {view.summary.chordEvents} chords.</p>
          <p>{view.summary.manualVoicings} Manual; {view.summary.frozenVoicings} Frozen; {view.summary.customChords} Custom chords. Exact supplied data is retained.</p>
          {view.groups.filter((group) => group.items.length > 0).map((group) => <section key={group.name} aria-label={group.name}>
            <h4>{group.name}</h4><ul>{group.items.map((item, index) => <li key={index}>{item.code} — {JSON.stringify(item.sourcePath)}{item.targetPath === null ? "" : ` → ${JSON.stringify(item.targetPath)}`}</li>)}</ul>
          </section>)}
          {view.omittedItems === 0 ? null : <p>{view.omittedItems} additional report items omitted by the 256-item display bound.</p>}
        </section>}
        {view.phase === "preview" ? <Button {...COMMON} id="studio-import-commit" busy={false} disabled={false} type="button" variant="primary"
          label={view.confirmationRequired || view.nonUndoable ? "Review replacement" : "Import this chart"} onAction={() => { void service.requestCommit(); }} /> : null}
        {view.phase === "chart-text" ? <Button {...COMMON} id="studio-import-stage-text" busy={false} disabled={false} type="button" variant="primary"
          label="Send to Quick entry" onAction={service.stageChartText} /> : null}
      </>}
      {view.message === null ? null : <p role={view.phase === "failed" ? "alert" : "status"}>{view.message}</p>}
      {view.issueCodes.length < 2 ? null : <ul aria-label="Import refusals">{view.issueCodes.map((code) => <li key={code}>{code}</li>)}</ul>}
    </div>} />;
}
