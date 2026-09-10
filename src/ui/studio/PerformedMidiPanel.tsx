import { useEffect, useRef, useState } from "preact/hooks";
import type { StudioPerformedMidiService } from "../../application/runtime";

export function PerformedMidiPanel({service,context}:{service:StudioPerformedMidiService;context:string}) {
  const [section,setSection]=useState("");
  const [,render]=useState(0);
  const mounted=useRef(true);
  const refresh=():void=>{if(mounted.current)render(n=>n+1);};
  useEffect(()=>{mounted.current=true;const unsubscribe=service.subscribe(refresh);refresh();return()=>{mounted.current=false;unsubscribe();service.cancel();};},[service]);
  const view=service.read(),busy=view.state==="preparing"||view.state==="delivering";
  const run=(action:()=>Promise<unknown>):void=>{const pending=action();refresh();void pending.finally(refresh);};
  const fieldId=`performed-midi-passage-${context}`;
  return <details class="studio-performed-midi" onToggle={event=>{if(!event.currentTarget.open){service.cancel();refresh();}}}>
    <summary>Export performed arrangement</summary>
    <section aria-label="Performed arrangement MIDI" data-artifact-sha256={view.sha256 ?? undefined}>
      <p>Ballad comp · 4/4 · up to 16 bars. Separate bass and comp tracks preserve the arrangement’s notes, timing and dynamics.</p>
      <p>MIDI uses the receiving instrument’s sound. Browser timbre, effects, count-in and repeating loops are not included. One pass is exported; tempo is rounded to MIDI microseconds.</p>
      <label for={fieldId}>Passage</label>{" "}
      <select id={fieldId} value={section} disabled={busy} onChange={event=>{service.cancel();setSection(event.currentTarget.value);refresh();}}>
        <option value="">Whole chart</option>
        {section !== "" && !view.sections.some(s => s.id === section) ? <option value={section}>Previous section (unavailable)</option> : null}
        {view.sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <p role="status" aria-live="polite">{view.message}</p>
      {view.state==="ready"?<p>{view.bars} bars · {view.notes} notes · {view.byteLength} bytes · {view.tempoMicroseconds} μs/quarter</p>:null}
      <div class="studio-midi-export__actions">
        <button class="ui-button" type="button" disabled={busy} onClick={()=>{run(()=>service.prepare(section===""?null:section));}}>Prepare performed MIDI</button>
        <button class="ui-button" type="button" disabled={view.state!=="ready"} onClick={()=>{run(()=>service.download());}}>Download performed MIDI</button>
        <button class="ui-button" type="button" disabled={view.state==="delivering"} onClick={()=>{service.cancel();refresh();}}>Cancel preparation</button>
      </div>
    </section>
  </details>;
}
