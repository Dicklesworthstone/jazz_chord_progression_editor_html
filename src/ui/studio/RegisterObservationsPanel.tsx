import {useState} from "preact/hooks";
import type {StudioController,StudioRegisterView,StudioInspectorSource,StudioInspectorResult} from "../../application/runtime";
const label=(p:Readonly<{step:string;alter:number;octave:number}>)=>`${p.step}${p.alter<0?"b".repeat(-p.alter):"#".repeat(p.alter)}${String(p.octave)}`;
export function RegisterObservationsPanel({source,stale,read,hear,release}:Readonly<{
  source:StudioInspectorSource;stale:boolean;read:StudioController["readRegister"];hear:(input:"pointer"|"keyboard")=>void;release:()=>void;
}>){
  const [result,setResult]=useState<StudioInspectorResult<StudioRegisterView>|null>(null),[showAll,setShowAll]=useState(false);
  const invalidated=stale||(result?.ok===true&&(result.value.source.documentId!==source.documentId||result.value.source.revision!==source.revision||result.value.source.eventId!==source.eventId));
  const observed=result?.ok===true?result.value.observations:null,facts=observed?.ok===true?observed.value:null;
  return <details class="studio-register" onToggle={e=>{if(e.currentTarget.open){setResult(read(source));setShowAll(false);}else release();}}>
    <summary>Register and spacing</summary>
    <section aria-label="Exact register observations">
      <p>Facts about the saved voicing. These observations do not rate musical quality or assign voices between chords.</p>
      {invalidated?<p role="alert">The chart or draft changed. Close this view and reopen the current chord.</p>:result!==null&&!result.ok?<p role="alert">{result.message}</p>:observed!==null&&!observed.ok?<p role="alert">{observed.message}</p>:facts!==null?<>
        <p>Range: MIDI {facts.minimumMidi}–{facts.maximumMidi} · span: {facts.span} semitones.</p>
        <p>{facts.belowC3} of {facts.notes.length} notes below C3 (MIDI 48).</p>
        <table><caption>Exact saved note occurrences</caption><thead><tr><th scope="col">Occurrence</th><th scope="col">Note</th><th scope="col">MIDI</th></tr></thead>
          <tbody>{facts.notes.map(n=><tr key={n.occurrence}><th scope="row">{n.occurrence+1}</th><td>{label(n.pitch)}</td><td>{n.midi}</td></tr>)}</tbody></table>
        {[{title:"Exact unison pairs",pairs:facts.unisons},{title:"Pairs 1–4 semitones apart, both below C3",pairs:facts.lowClosePairs}].map(group=><section key={group.title} aria-label={group.title}>
          <h3>{group.title}: {group.pairs.length}</h3>
          {group.pairs.length===0?<p>None in this voicing.</p>:<ol>{group.pairs.slice(0,showAll?120:8).map(pair=>{
            const first=facts.notes[pair.first],second=facts.notes[pair.second];if(first===undefined||second===undefined)return null;
            return <li key={`${String(pair.first)}-${String(pair.second)}`}>#{first.occurrence+1} {label(first.pitch)} and #{second.occurrence+1} {label(second.pitch)} · {pair.semitones} semitones</li>;
          })}</ol>}
        </section>)}
        {facts.unisons.length>8||facts.lowClosePairs.length>8?<button class="studio-inspector-button" type="button" aria-expanded={showAll} onClick={()=>{setShowAll(!showAll);}}>{showAll?"Show first eight pairs per group":"Show all pairs"}</button>:null}
        {result?.ok===true&&result.value.externalBass?<p>The separate external slash bass is not included in these facts or this voicing audition.</p>:null}
        <div class="studio-inspector-actions"><button class="studio-inspector-button" type="button" onClick={e=>{hear(e.detail===0?"keyboard":"pointer");}}>Hear observed notes</button><button class="studio-inspector-button" type="button" onClick={release}>Release observed notes</button></div>
      </>:null}
    </section>
  </details>;
}
