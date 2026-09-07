import { useCallback } from "preact/hooks";
import type { StudioExactShareService, StudioExactShareView } from "../../application/runtime";
import { Button } from "../primitives";
import { Dialog } from "../overlays";

const DISMISSIBLE = Object.freeze({ kind: "dismissible" } as const);
const FOCUS_TARGETS = Object.freeze({ triggerId: "studio-copy-share-link", workflowTargetId: "studio-document-title", workspaceId: "workspace" });
export function ExactShareDialog({ service, view }: Readonly<{ service: StudioExactShareService; view: StudioExactShareView }>) {
  const onContractRefusal = useCallback(() => { service.cancel(); }, [service]);
  if (!view.open) return view.message === null ? null : <p role="alert">{view.message}</p>;
  return <Dialog backgroundRootId="studio-shell-background" busy={false} closeLabel="Cancel sharing"
    content={<div class="studio-exact-share">
      <p>The link includes the committed chart's title, description, sections, annotations, exact notes and playback settings. Anyone receiving it can read them.</p>
      <p>Sound can change between app versions. Nothing is uploaded.</p>
      {view.message === null ? null : <p role={view.phase === "failed" || view.phase === "oversized" ? "alert" : "status"}>{view.message}</p>}
      {view.url === null ? null : <>
        <label for="studio-exact-share-url">Exact chart link</label>
        <textarea id="studio-exact-share-url" value={view.url} readOnly rows={4} spellcheck={false}
          onFocus={event => { event.currentTarget.select(); }}
          onClick={event => { event.currentTarget.select(); }}
          aria-describedby="studio-exact-share-revision" />
        <p id="studio-exact-share-revision">Chart revision {view.revision}. Unapplied edits are not included.</p>
        <Button id="studio-exact-share-copy" label={view.copyPending ? "Copying…" : "Copy exact link"}
          onAction={() => { void service.copy(); }} busy={view.copyPending} disabled={view.copyPending}
          density="comfortable" describedBy={[]} invalid={false} type="button" variant="primary" />
      </>}
      <p>A link opens the app at its web address. An exact JSON file also works in a downloaded, offline studio.</p>
      <Button id="studio-exact-share-json" label="Download exact JSON" onAction={service.downloadJson}
        busy={false} disabled={false} density="comfortable" describedBy={[]} invalid={false} type="button" variant="secondary" />
    </div>}
    density="comfortable" describedBy={[]} description="Share every stored note, spelling and duration."
    disabled={false} dismissibility={DISMISSIBLE} focusTargets={FOCUS_TARGETS} id="studio-exact-share-dialog"
    initialFocus="heading" initialFocusId={null} invalid={false} onContractRefusal={onContractRefusal}
    onDismiss={service.cancel} open title="Share the exact chart" />;
}
