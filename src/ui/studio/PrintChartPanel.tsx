import {useEffect,useState} from "preact/hooks";
import type {StudioPrintService,PrintPage} from "../../application/runtime";
function usePrintView(service:StudioPrintService){const [,render]=useState(0);useEffect(()=>service.subscribe(()=>{render(n=>n+1);}),[service]);return service.read();}
function PageSvg({page}:{page:PrintPage}){
 return <svg class="studio-print-page" viewBox={`0 0 ${String(page.width)} ${String(page.height)}`} width={`${String(page.width)}mm`} height={`${String(page.height)}mm`} role="img" aria-label="Chord chart print page">
  <title>Chord chart print page</title><rect class="studio-print-paper" width="100%" height="100%" />
  {page.boxes.map((b,i)=><rect key={`box-${String(i)}`} class="studio-print-cell" x={b.x} y={b.y} width={b.width} height={b.height} data-source-id={b.sourceId} />)}
  {page.texts.map((t,i)=><text key={`text-${String(i)}`} x={t.x} y={t.y} font-size={t.size} data-source-id={t.sourceId}>{t.text}</text>)}
 </svg>;
}
export function PrintOnlyDocument({service}:{service:StudioPrintService}){const view=usePrintView(service);return view.state!=="ready"?null:<div class="studio-print-only" data-paper={view.paper} aria-hidden="true">{view.pages.map((page,i)=><div class="studio-print-sheet" key={i}><PageSvg page={page} /></div>)}</div>;}
export function PrintChartPanel({service}:{service:StudioPrintService}){
 const view=usePrintView(service),page=view.pages[view.pageIndex];
 return <details class="studio-print-tool" onToggle={event=>{if(!event.currentTarget.open)service.close();}}><summary>Print chord chart</summary><section aria-label="Printable chord chart">
  <p>Print original chord symbols and exact beat durations. This chord-only view omits voicing octaves, annotations, descriptions and sound settings. Keep a JSON backup for the complete chart.</p>
  <p>Uses the bundled Latin font. Unsupported characters and overfull bars are reported without changing your chart.</p>
  <label>Paper <select value={view.paper} onChange={e=>{service.setPaper(e.currentTarget.value==="letter"?"letter":"a4");}}><option value="a4">A4</option><option value="letter">Letter</option></select></label>
  <div class="studio-print-actions"><button type="button" disabled={view.state==="preparing"} onClick={()=>{void service.prepare();}}>Prepare print preview</button><button type="button" disabled={view.state!=="ready"} onClick={service.print}>Print all pages</button><button type="button" disabled={view.state!=="ready"||!view.canDownload} onClick={service.download}>Download page SVG</button><button type="button" onClick={service.close}>Close print preview</button></div>
  <p role="status" aria-live="polite">{view.message}</p>
  {page===undefined?null:<><label>Preview page <select value={String(view.pageIndex)} onChange={e=>{service.selectPage(Number(e.currentTarget.value));}}>{view.pages.map((_p,i)=><option key={i} value={String(i)}>{String(i+1)} of {String(view.pages.length)}</option>)}</select></label><PageSvg page={page} /></>}
 </section></details>;
}
