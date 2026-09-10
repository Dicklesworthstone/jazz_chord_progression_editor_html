import { useEffect, useRef, useState } from "preact/hooks";
import type { StudioController, StudioNoteFirstDraft } from "../../application/runtime";

export type StudioNoteFirstPorts=Readonly<{
  documentId:string;revision:number;sections:readonly Readonly<{id:string;name:string}>[];
  read:StudioController["readNoteFirst"];insert:StudioController["insertNoteFirst"];
  hear:(text:string,input:"pointer"|"keyboard")=>ReturnType<StudioController["previewNoteFirst"]>;
  release:StudioController["releaseNoteFirst"];
}>;
export function NoteFirstPanel({ports}:{ports:StudioNoteFirstPorts}){
  const [text,setText]=useState("");
  const [draft,setDraft]=useState<StudioNoteFirstDraft|null>(null);
  const [section,setSection]=useState("");
  const [choice,setChoice]=useState("custom");
  const [customLabel,setCustomLabel]=useState("");
  const [ack,setAck]=useState(false),[more,setMore]=useState(false),[notice,setNotice]=useState("");
  const latest=useRef(ports);latest.current=ports;
  useEffect(()=>()=>{void latest.current.release();},[]);
  const analysis=draft?.analysis;
  const stale=draft!==null&&(draft.source.documentId!==ports.documentId||draft.source.revision!==ports.revision);
  const candidate=analysis?.ok?analysis.candidates.find(c=>c.name===choice):undefined;
  const allNames=analysis?.ok?analysis.candidates:[];
  const exactNames=allNames.filter(c=>c.spellingExact);
  const initialNames=(exactNames.length>0?exactNames:allNames).slice(0,3);
  const visibleNames=more?allNames:candidate!==undefined&&!initialNames.includes(candidate)?[...initialNames.slice(0,2),candidate]:initialNames;
  const valid=analysis?.ok===true&&!stale;
  const canAdd=valid&&ports.sections.some(s=>s.id===section)&&(choice==="custom"?customLabel.trim().length>0:candidate!==undefined&&(candidate.spellingExact||ack));
  const analyze=():void=>{
    void ports.release();const next=ports.read(text);setDraft(next);setAck(false);setMore(false);setNotice("");
    setChoice(next.analysis.ok?next.analysis.candidates[0]?.name??"custom":"custom");
  };
  return <details class="studio-note-first" onToggle={event=>{if(!event.currentTarget.open)void ports.release();}}>
    <summary>Start from notes</summary>
    <section aria-label="Note-first entry">
      <p>Know the voicing before the name? Enter up to 16 notes with octaves. We keep their spelling, order and doubles.</p>
      <label>Voicing notes<textarea class="studio-command-lane__input" rows={2} maxLength={512} spellcheck={false}
        placeholder="A3 C4 E4 G4" value={text} onInput={e=>{void ports.release();setText(e.currentTarget.value);setDraft(null);setNotice("");}} /></label>
      <button class="ui-button" type="button" onClick={analyze}>{stale?"Analyze again":"Find chord names"}</button>
      {analysis!==undefined&&!analysis.ok?<p role="alert">{analysis.message}</p>:null}
      {analysis?.ok?<>
        <p>Exact stored notes: <strong>{analysis.normalizedText}</strong></p>
        {stale?<p role="alert">The chart changed. Analyze again before adding these notes.</p>:null}
        <fieldset><legend>Choose a reading</legend>
          {visibleNames.map(c=><label key={c.name} style={{display:"block",padding:"0.5rem 0",overflowWrap:"anywhere"}}>
            <input type="radio" name="note-first-choice" value={c.name} checked={choice===c.name} onChange={()=>{setChoice(c.name);setAck(false);}} />
            {c.name} — {c.spellingExact?"exact spelling":"enharmonic reading"}. Formula: {c.formulaNotes.join(" ")}
          </label>)}
          {allNames.length>initialNames.length?<button class="ui-button" type="button" onClick={()=>{setMore(!more);}}>{more?"Fewer names":`All ${String(analysis.candidates.length)} names`}</button>:null}
          <label style={{display:"block",padding:"0.5rem 0"}}><input type="radio" name="note-first-choice" value="custom" checked={choice==="custom"} onChange={()=>{setChoice("custom");setAck(false);}} />Custom voicing</label>
          {choice==="custom"?<label>Custom label<input class="studio-command-lane__input" maxLength={64} value={customLabel} onInput={e=>{setCustomLabel(e.currentTarget.value);}} /></label>:null}
        </fieldset>
        {candidate!==undefined&&!candidate.spellingExact?<label style={{display:"block",padding:"0.5rem 0"}}><input type="checkbox" checked={ack} onChange={e=>{setAck(e.currentTarget.checked);}} />Use this name as a Custom label, keeping my exact notes.</label>:null}
        <label>Add one full bar to<select class="studio-command-lane__input" value={section} onChange={e=>{setSection(e.currentTarget.value);}}>
          <option value="">Choose a section</option>{ports.sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
        <p>The new bar goes at the end of that section with Manual voicing. One Undo removes it.</p>
        <button class="ui-button" type="button" disabled={!valid} onClick={e=>{const result=ports.hear(text,e.detail===0?"keyboard":"pointer");setNotice(result.ok?"Preview requested; your chart is unchanged.":result.refusal.message);}}>Hear exact notes</button>
        <button class="ui-button" type="button" onClick={()=>{void ports.release();setNotice("Preview released.");}}>Release notes</button>
        <button class="ui-button" type="button" disabled={!canAdd} onClick={()=>{
          if(draft===null)return;void ports.release();
          const result=ports.insert(draft.source,text,{name:choice==="custom"?null:choice,customLabel,acknowledgeEnharmonic:ack},section);
          if(result.ok){setDraft(null);setText("");setNotice("Added one bar with your exact Manual voicing. Undo is available in the chart.");}
          else setNotice(result.refusal.message);
        }}>Add bar from notes</button>
      </>:null}
      <p role="status">{notice}</p>
    </section>
  </details>;
}
