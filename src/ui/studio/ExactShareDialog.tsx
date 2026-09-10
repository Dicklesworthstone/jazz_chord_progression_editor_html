import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { StudioExactShareService, StudioExactShareView } from "../../application/runtime";
import { Button } from "../primitives";
import { Dialog } from "../overlays";

function ExactQrPreview({service,view}:Readonly<{service:StudioExactShareService;view:StudioExactShareView}>){
  const host=useRef<HTMLDivElement>(null),[space,setSpace]=useState(0);
  useEffect(()=>{
    const element=host.current;if(element===null)return;
    const dialog=element.closest<HTMLElement>(".ui-dialog");
    const measure=():void=>{
      // A scanner must see the whole code and quiet zone at once, even when
      // the dialog scrolls on a short landscape screen or after rotation.
      const style=dialog===null?null:getComputedStyle(dialog);
      const height=dialog===null?window.innerHeight:dialog.clientHeight-parseFloat(style?.paddingTop??"0")-parseFloat(style?.paddingBottom??"0");
      setSpace(Math.floor(Math.min(element.getBoundingClientRect().width,height)));
    };
    measure();const observer=new ResizeObserver(measure);observer.observe(element);if(dialog!==null)observer.observe(dialog);
    return()=>{observer.disconnect();};
  },[]);
  if(!view.qrAvailable)return null;
  const qr=view.qr,extent=qr===null?0:qr.matrix.size+8,moduleSize=extent===0?0:Math.min(4,Math.floor(space/extent));
  return <div class="studio-exact-qr" ref={host}>
    <Button id="studio-exact-share-qr" label={view.qrPhase==="preparing"?"Preparing QR…":"Show QR"} onAction={()=>{void service.prepareQr();}} busy={view.qrPhase==="preparing"} disabled={view.qrPhase==="preparing"||view.url===null} density="comfortable" describedBy={[]} invalid={false} type="button" variant="secondary" />
    {view.qrMessage===null?null:<p role="status">{view.qrMessage}</p>}
    {qr===null?null:moduleSize<2?<p>QR is too dense for this screen. Use a larger screen, copy the exact link, or download JSON.</p>:<>
      <svg class="studio-exact-qr__image" role="img" aria-label="QR code for the exact chart" width={extent*moduleSize} height={extent*moduleSize} viewBox={`0 0 ${String(extent)} ${String(extent)}`} shape-rendering="crispEdges">
        <rect width={extent} height={extent} fill="#fff" /><path d={qr.path} fill="#000" />
      </svg>
      <p>This compressed QR link needs a current app. Older app versions may refuse it; the ordinary exact link above remains available.</p>
    </>}
  </div>;
}
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
      <ExactQrPreview service={service} view={view} />
      <p>A link opens the app at its web address. An exact JSON file also works in a downloaded, offline studio.</p>
      <Button id="studio-exact-share-json" label="Download exact JSON" onAction={service.downloadJson}
        busy={false} disabled={false} density="comfortable" describedBy={[]} invalid={false} type="button" variant="secondary" />
    </div>}
    density="comfortable" describedBy={[]} description="Share every stored note, spelling and duration."
    disabled={false} dismissibility={DISMISSIBLE} focusTargets={FOCUS_TARGETS} id="studio-exact-share-dialog"
    initialFocus="heading" initialFocusId={null} invalid={false} onContractRefusal={onContractRefusal}
    onDismiss={service.cancel} open title="Share the exact chart" />;
}
