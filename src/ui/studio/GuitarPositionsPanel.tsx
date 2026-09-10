import {useState} from "preact/hooks";
import type {StudioController,StudioGuitarView,StudioInspectorSource,StudioInspectorResult} from "../../application/runtime";
type Position=StudioGuitarView["search"]["positions"][number];
function Diagram({position,index}:{position:Position;index:number}){
  const fretted=position.frets.filter((f):f is number=>f!==null&&f>0);
  const start=fretted.length===0?1:Math.min(...fretted),rows=Math.max(4,position.highestFret-start+1),bottom=48+rows*26;
  return <svg class="studio-guitar-diagram" viewBox={`0 0 220 ${String(bottom+30)}`} role="img" aria-label={`Position ${String(index+1)}, strings 6 to 1 left to right. Frets ${position.frets.map(f=>f===null?"mute":String(f)).join(", ")}.`}>
    {Array.from({length:rows+1},(_v,row)=><line key={`f${String(row)}`} x1="42" x2="177" y1={48+row*26} y2={48+row*26} stroke="currentColor" />)}
    {Array.from({length:rows},(_v,row)=><text key={`n${String(row)}`} x="16" y={66+row*26} fill="currentColor" font-size="12">{start+row}</text>)}
    {position.frets.map((f,i)=><g key={i}>
      <line x1={42+i*27} x2={42+i*27} y1="48" y2={bottom} stroke="currentColor" />
      <text x={42+i*27} y={bottom+20} text-anchor="middle" fill="currentColor" font-size="11">{6-i}</text>
      {f===null?<text x={42+i*27} y="34" text-anchor="middle" fill="currentColor">×</text>
        :f===0?<circle cx={42+i*27} cy="28" r="5" fill="none" stroke="currentColor" />
        :<circle cx={42+i*27} cy={61+(f-start)*26} r="6" fill="currentColor" />}
    </g>)}
  </svg>;
}
export function GuitarPositionsPanel({source,stale,read,hear,release}:Readonly<{
  source:StudioInspectorSource;stale:boolean;read:StudioController["readGuitar"];hear:(input:"pointer"|"keyboard")=>void;release:()=>void;
}>){
  const [result,setResult]=useState<StudioInspectorResult<StudioGuitarView>|null>(null),[position,setPosition]=useState(0);
  const invalidated=stale||(result?.ok===true&&(result.value.source.documentId!==source.documentId||result.value.source.revision!==source.revision||result.value.source.eventId!==source.eventId));
  const search=result?.ok===true?result.value.search:null,selected=search?.positions[position];
  const label=(p:Readonly<{step:string;alter:number;octave:number}>)=>`${p.step}${p.alter<0?"b".repeat(-p.alter):"#".repeat(p.alter)}${String(p.octave)}`;
  return <details class="studio-guitar" onToggle={e=>{if(e.currentTarget.open){setResult(read(source));setPosition(0);}else release();}}>
    <summary>On guitar — exact voicing</summary>
    <section aria-label="Exact guitar positions">
      <p>Saved chart voicing · standard tuning E2 A2 D3 G3 B3 E4 · frets 0–20. Positions preserve every note; they are not guaranteed comfortable fingerings.</p>
      {invalidated?<p role="alert">The chart or draft changed. Close this view and reopen the current chord.</p>:result!==null&&!result.ok?<p role="alert">{result.message}</p>:search!==null?<>
        <p role="status">{search.message}</p>
        <p class="studio-guitar-notes">{search.pitches.map(label).join(" · ")}</p>
        {result?.ok===true&&result.value.externalBass?<p>The separate external slash bass is not included in these positions or this voicing audition.</p>:null}
        {selected===undefined?null:<>
          <div class="studio-inspector-actions">{search.positions.map((_p,i)=><button class="studio-inspector-button" type="button" key={i} aria-pressed={i===position} onClick={()=>{setPosition(i);}}>Position {i+1}</button>)}</div>
          <p>Fretted span: {selected.span} · highest fret: {selected.highestFret}. Open circles sound open strings; × strings stay muted.</p>
          <Diagram position={selected} index={position} />
          <table><caption>Exact note occurrences for position {position+1}</caption><thead><tr><th scope="col">Note</th><th scope="col">String</th><th scope="col">Fret</th></tr></thead>
            <tbody>{selected.assignments.map(a=><tr key={a.occurrence}><th scope="row">{a.occurrence+1}. {label(a.pitch)}</th><td>{a.string}</td><td>{a.fret===0?"Open":a.fret}</td></tr>)}</tbody>
          </table>
          <div class="studio-inspector-actions">
            <button class="studio-inspector-button" type="button" onClick={e=>{hear(e.detail===0?"keyboard":"pointer");}}>Hear these exact notes</button>
            <button class="studio-inspector-button" type="button" onClick={release}>Release notes</button>
          </div>
          <p>Changing positions only changes the diagram. The exact notes and chart stay the same.</p>
        </>}
      </>:null}
    </section>
  </details>;
}
