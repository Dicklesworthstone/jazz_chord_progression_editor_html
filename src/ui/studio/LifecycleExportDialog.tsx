import { useCallback, useState } from "preact/hooks";
import type { StudioLifecycleService, StudioLifecycleView } from "../../application/runtime";
import type { UiDiagnostic } from "../ui-contract";
import { Button } from "../primitives";
import { Dialog } from "../overlays";

const DISMISSIBLE = Object.freeze({ kind: "dismissible" } as const);
const DELIVERING = Object.freeze({ kind: "blocked", reason: "Wait for the browser download to finish." } as const);
const FOCUS_TARGETS = Object.freeze({ triggerId: "studio-export-json", workflowTargetId: "studio-document-title", workspaceId: "workspace" });

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
  return <Dialog
    backgroundRootId="studio-shell-background"
    busy={delivering}
    closeLabel="Close JSON export"
    content={<div class="studio-lifecycle-export">
      <p>JSON keeps the chart's exact notes, spellings, timing, settings, and annotations. Keep this file as your portable copy.</p>
      {view.filename === null ? null : <dl>
        <dt>File</dt><dd>{view.filename}</dd>
        <dt>Size</dt><dd>{view.byteLength?.toLocaleString()} bytes</dd>
        <dt>Chart revision</dt><dd>{view.revision}</dd>
      </dl>}
      {view.phase === "preparing" ? <p role="status">Preparing and checking JSON…</p> : null}
      {view.message === null ? null : <p role={view.phase === "failed" ? "alert" : "status"}>{view.message}</p>}
      <Button busy={delivering} density="comfortable" describedBy={[]}
        disabled={view.phase !== "ready"} id="studio-lifecycle-download" invalid={false}
        label={delivering ? "Handing off…" : "Download JSON"}
        onAction={() => { void service.deliverCanonicalExport(); }} type="button" variant="primary" />
    </div>}
    density="comfortable" describedBy={[]}
    description="Prepare a portable chart file, then hand it to your browser."
    disabled={false} dismissibility={delivering ? DELIVERING : DISMISSIBLE}
    focusTargets={FOCUS_TARGETS} id="studio-lifecycle-export-dialog"
    initialFocus="heading" initialFocusId={null} invalid={false}
    onContractRefusal={onContractRefusal} onDismiss={service.cancelLifecycleDialog}
    open title="Export chart as JSON"
  />;
}
