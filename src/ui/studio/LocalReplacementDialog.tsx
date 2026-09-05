import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import type { StudioLocalReplacementService, StudioLocalReplacementView } from "../../application/runtime";
import type { UiDiagnostic } from "../ui-contract";
import { Button, Checkbox } from "../primitives";
import { Dialog } from "../overlays";

const COMMON = { density: "comfortable", describedBy: [], invalid: false } as const;
const DISMISSIBLE = Object.freeze({ kind: "dismissible" } as const);
const BLOCKED = Object.freeze({ kind: "blocked", reason: "Wait for chart replacement to finish." } as const);
export function LocalReplacementDialog({ service, view }: Readonly<{
  service: StudioLocalReplacementService; view: StudioLocalReplacementView;
}>) {
  const [refusal, setRefusal] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  useEffect(() => {
    if (view.open) setRefusal(null);
    else setAcknowledged(false);
  }, [view.open]);
  const focus = useMemo(() => ({ triggerId: view.triggerId, workflowTargetId: "studio-document-title", workspaceId: "workspace" }), [view.triggerId]);
  const onContractRefusal = useCallback((diagnostic: UiDiagnostic) => {
    setRefusal(`${diagnostic.code}: ${diagnostic.message}`);
    service.cancel();
  }, [service]);
  if (!view.open) {
    const message = refusal ?? view.message;
    return message === null ? null : <p role={refusal !== null || view.phase === "failed" ? "alert" : "status"}>{message}</p>;
  }
  const busy = view.phase === "committing";
  return <Dialog {...COMMON} id="studio-local-replacement-dialog" backgroundRootId="studio-shell-background"
    title={view.origin === "new" ? "Start a new chart?" : "Load this lesson?"}
    description="Review the replacement before continuing." closeLabel="Cancel replacement" open busy={busy} disabled={false}
    dismissibility={busy || view.reconciliationRequired ? BLOCKED : DISMISSIBLE} focusTargets={focus}
    initialFocus="heading" initialFocusId={null} onDismiss={service.cancel} onContractRefusal={onContractRefusal}
    content={<div class="studio-document-import">
      <p>{view.origin === "new" ? "Start an empty chart" : <>Load <strong>{view.title}</strong></>} and replace the current chart?</p>
      <p>Playback and previews will stop before replacement. The current chart and selection stay unchanged if you cancel.</p>
      {view.nonUndoable ? <>
        <p role="alert">This replacement exceeds the history boundary and cannot be undone. Export your current chart first.</p>
        <Checkbox {...COMMON} id="studio-replacement-nonundoable" label="I understand this replacement cannot be undone"
          checked={acknowledged} busy={busy} disabled={busy} onCheckedChange={event => { setAcknowledged(event.value); }} />
      </> : <p>Undo restores the previous chart and selection.</p>}
      {view.exportRecommended ? <p>Export a portable JSON copy before replacing this chart.</p> : null}
      <Button {...COMMON} id="studio-replacement-export-first" label="Export current chart first"
        variant="secondary" type="button" busy={false} disabled={busy || view.reconciliationRequired} onAction={service.exportCurrentFirst} />
      <Button {...COMMON} id="studio-replacement-confirm" label={busy ? "Replacing chart…" : "Confirm replacement"}
        variant="destructive" type="button" busy={busy} disabled={view.phase !== "confirm" || (view.nonUndoable && !acknowledged)}
        onAction={() => { void service.confirm(acknowledged); }} />
      <Button {...COMMON} id="studio-replacement-cancel" label="Cancel" variant="secondary" type="button" busy={false}
        disabled={busy || view.reconciliationRequired} onAction={service.cancel} />
      {view.message === null ? null : <p role={view.phase === "failed" ? "alert" : "status"}>{view.message}</p>}
    </div>} />;
}
