import {useEffect,useRef,useState} from "preact/hooks";
import type {StudioController,StudioPadsView,StudioInspectorResult,StudioInspectorSource} from "../../application/runtime";
export type StudioChordPadsPorts=Readonly<{
  documentId:string;revision:number;read:StudioController["readPads"];release:StudioController["releasePad"];
  press:(source:StudioInspectorSource,input:"pointer"|"keyboard",hold:boolean)=>ReturnType<StudioController["pressPad"]>;
}>;
const label=(p:Readonly<{step:string;alter:number;octave:number}>)=>`${p.step}${p.alter<0?"b".repeat(-p.alter):"#".repeat(p.alter)}${String(p.octave)}`;
export function ChordPadsPanel({ports}:{ports:StudioChordPadsPorts}){
  const [result,setResult]=useState<StudioInspectorResult<StudioPadsView>|null>(null),[notice,setNotice]=useState(""),[held,setHeld]=useState<string|null>(null);
  const owner=useRef<Readonly<{id:number;eventId:string;input:number|"keyboard"|"tap"}>|null>(null),latest=useRef(ports);latest.current=ports;
  const release=():void=>{const active=owner.current;owner.current=null;setHeld(null);if(active!==null){void latest.current.release(active.id);setNotice("Pad release requested. Instrument tails may decay.");}};
  const releaseRef=useRef(release);releaseRef.current=release;
  useEffect(()=>{
    const hidden=()=>{if(document.hidden)releaseRef.current();},blur=()=>{releaseRef.current();};
    document.addEventListener("visibilitychange",hidden);window.addEventListener("blur",blur);
    return()=>{document.removeEventListener("visibilitychange",hidden);window.removeEventListener("blur",blur);const active=owner.current;owner.current=null;if(active!==null)void latest.current.release(active.id);};
  },[]);
  useEffect(()=>{releaseRef.current();},[ports.documentId,ports.revision]);
  const view=result?.ok===true?result.value:null;
  const stale=view!==null&&(view.documentId!==ports.documentId||view.revision!==ports.revision);
  const load=(section:string|null,page:number):void=>{release();setResult(ports.read(section,page));setNotice("");};
  const begin=(source:StudioInspectorSource,input:number|"keyboard"|"tap"):void=>{
    release();const started=ports.press(source,typeof input==="number"?"pointer":"keyboard",input!=="tap");
    owner.current={id:started.id,eventId:source.eventId,input};setHeld(input==="tap"?null:source.eventId);setNotice("Preparing these exact notes…");
    void started.completion.then(r=>{if(owner.current?.id!==started.id)return;setNotice(r.ok?(input==="tap"?"Short tap accepted: up to 1.2 seconds plus the instrument tail.":"Hold accepted: up to 8 seconds; naturally decaying sounds may end sooner."):r.message);if(!r.ok){owner.current=null;setHeld(null);}});
  };
  return <details class="studio-pads" onToggle={e=>{if(e.currentTarget.open)load(null,0);else release();}}>
    <summary>Play chord pads</summary>
    <section aria-label="Exact chord pads">
      <p>Hold a pad, Space or Enter to play its saved voicing, up to 8 seconds. Release to end it. One pad at a time; sound preparation can take a moment.</p>
      <p>These pads do not record, change the chart or control the band's timing.</p>
      {stale?<p role="alert">The chart changed. Close and reopen pads to use its current notes.</p>:result!==null&&!result.ok?<p role="alert">{result.message}</p>:view!==null?<>
        <label>Pad section <select value={view.sectionId} onChange={e=>{load(e.currentTarget.value,0);}}>{view.sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <p>Page {view.page+1} of {view.pageCount} · {view.total} chords in this section.</p>
        {view.total===0?<p>This section contains no chords.</p>:null}
        <div class="studio-pads__grid">{view.pads.map(pad=><button type="button" class="studio-pads__pad" key={pad.source.eventId} aria-pressed={held===pad.source.eventId}
          onPointerDown={e=>{if(e.button!==0||owner.current!==null&&typeof owner.current.input==="number")return;e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);begin(pad.source,e.pointerId);}}
          onPointerUp={e=>{if(owner.current?.input===e.pointerId)release();}}
          onPointerCancel={e=>{if(owner.current?.input===e.pointerId)release();}}
          onLostPointerCapture={e=>{if(owner.current?.input===e.pointerId)release();}}
          onKeyDown={e=>{if(e.key!==" "&&e.key!=="Enter")return;e.preventDefault();if(!e.repeat&&(owner.current===null||owner.current.input==="tap"))begin(pad.source,"keyboard");}}
          onKeyUp={e=>{if(e.key!==" "&&e.key!=="Enter")return;e.preventDefault();if(owner.current?.eventId===pad.source.eventId&&owner.current.input==="keyboard")release();}}
          onBlur={()=>{if(owner.current?.eventId===pad.source.eventId)release();}}
          onClick={e=>{if(e.detail===0&&(owner.current===null||owner.current.input==="tap"))begin(pad.source,"tap");}}>
          <strong>{pad.symbol}</strong><span>{pad.pitches.map(label).join(" · ")}</span>{pad.externalBass?<small>Separate external bass omitted</small>:null}
        </button>)}</div>
        <div class="studio-pads__actions"><button type="button" disabled={view.page===0} onClick={()=>{load(view.sectionId,view.page-1);}}>Previous pad page</button><button type="button" disabled={view.page+1>=view.pageCount} onClick={()=>{load(view.sectionId,view.page+1);}}>Next pad page</button></div>
      </>:null}
      <button type="button" onClick={release}>Release pads</button><p role="status" aria-live="polite">{notice}</p>
    </section>
  </details>;
}
