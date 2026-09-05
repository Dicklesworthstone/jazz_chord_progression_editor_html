import { useCallback, useState } from "preact/hooks";
import type { StudioLifecycleService, StudioLifecycleView } from "../../application/runtime";
import type { UiDiagnostic } from "../ui-contract";
import { Button } from "../primitives";
import { Dialog } from "../overlays";

const DISMISSIBLE = Object.freeze({ kind: "dismissible" } as const);
const DELIVERING = Object.freeze({ kind: "blocked", reason: "Wait for the browser download to finish." } as const);
const FOCUS_TARGETS = Object.freeze({ triggerId: "studio-export-json", workflowTargetId: "studio-document-title", workspaceId: "workspace" });
const TEXT_FOCUS_TARGETS = Object.freeze({ ...FOCUS_TARGETS, triggerId: "studio-export-text" });

export function LifecycleExportDialog({ service, view }: Readonly<{
  service: StudioLifecycleService;
  view: StudioLifecycleView;
}>) {
  const [refusal, setRefusal] = useState<string | null>(null);
  const onContractRefusal = useCallback((diagnostic: UiDiagnostic) => {
    setRefusal(`${diagnostic.code}: ${diagnostic.message}`);
    service.cancelLifecycleDialog();
  }, [service]);
  if (view.dialog === null) {
    const message = refusal ?? view.message;
    return message === null ? null : <p role="alert">{message}</p>;
  }
  const delivering = view.phase === "delivering";
  const isText = view.format === "lead-sheet-text";
  const formatLabel = isText ? "chart text" : "JSON";
  return <Dialog
    backgroundRootId="studio-shell-background"
    busy={delivering}
    closeLabel={`Close ${formatLabel} export`}
    content={<div class="studio-lifecycle-export">
      <p>{isText
        ? "Chart text keeps harmony, exact durations, sections, annotations, and the global key, meter, and tempo. Use JSON for a complete portable copy."
        : "JSON keeps the chart's exact notes, spellings, timing, settings, and annotations. Keep this file as your portable copy."}</p>
      {view.filename === null ? null : <dl>
        <dt>Format</dt><dd>{isText ? "Lead-sheet text" : "Canonical JSON"}</dd>
        <dt>File</dt><dd>{view.filename}</dd>
        <dt>Size</dt><dd>{view.byteLength?.toLocaleString()} bytes</dd>
        <dt>Chart revision</dt><dd>{view.revision}</dd>
      </dl>}
      {isText && view.losses.length > 0 ? <section aria-label="Text export losses">
        <h3>What this text file leaves out</h3>
        <ul>{view.losses.map((loss) => <li key={loss.label}>{loss.label}: {loss.count.toLocaleString()}</li>)}</ul>
        <p>Downloading text does not mark the chart as exported to JSON.</p>
      </section> : null}
      {view.phase === "preparing" ? <p role="status">Preparing and checking {formatLabel}…</p> : null}
      {view.message === null ? null : <p role={view.phase === "failed" ? "alert" : "status"}>{view.message}</p>}
      <Button busy={delivering} density="comfortable" describedBy={[]}
        disabled={view.phase !== "ready"} id="studio-lifecycle-download" invalid={false}
        label={delivering ? "Handing off…" : isText ? "Download chart text" : "Download JSON"}
        onAction={() => { void (isText ? service.deliverTextExport() : service.deliverCanonicalExport()); }} type="button" variant="primary" />
    </div>}
    density="comfortable" describedBy={[]}
    description="Prepare a portable chart file, then hand it to your browser."
    disabled={false} dismissibility={delivering ? DELIVERING : DISMISSIBLE}
    focusTargets={isText ? TEXT_FOCUS_TARGETS : FOCUS_TARGETS} id="studio-lifecycle-export-dialog"
    initialFocus="heading" initialFocusId={null} invalid={false}
    onContractRefusal={onContractRefusal} onDismiss={service.cancelLifecycleDialog}
    open title={isText ? "Export chart as text" : "Export chart as JSON"}
  />;
}
