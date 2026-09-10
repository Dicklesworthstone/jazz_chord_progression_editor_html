import {useEffect,useState} from "preact/hooks";
import type {StudioSongbookService} from "../../application/runtime";
const EXAMPLE="{title: My turnaround}\n{time: 4/4}\n{start_of_grid: 4x4}\n| Cmaj7 . . . | Am7 . . . | Dm7 . . . | G7 . . . |\n{end_of_grid}";
export function SongbookPanel({service}:{service:StudioSongbookService}){
 const [view,setView]=useState(service.read()),[page,setPage]=useState(0);
 useEffect(()=>{const update=():void=>{setView(service.read());};const stop=service.subscribe(update);update();return()=>{stop();service.close();};},[service]);
 const grid=view.result?.ok?view.result.grid:null,shown=grid?.bars.slice(page*8,page*8+8)??[];
 return <details class="studio-songbook" onToggle={e=>{if(!e.currentTarget.open){service.close();setPage(0);}}}>
  <summary>Import a ChordPro grid</summary>
  <section aria-label="ChordPro songbook import">
   <p>Add one 4/4 grid as a new section. Lyrics, repeat endings, two-bar repeat signs and other ChordPro dialects are not supported.</p>
   <label>ChordPro file<input class="studio-command-lane__input" type="file" accept=".crd,.cho,.chordpro,.pro,.txt,text/plain" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";setPage(0);if(file!==undefined)void service.previewFile(file);}} /></label>
   <label>ChordPro text<textarea class="studio-command-lane__input" rows={6} maxLength={16384} spellcheck={false} value={view.text} onInput={e=>{setPage(0);service.setText(e.currentTarget.value);}} /></label>
   <div class="studio-songbook__actions"><button type="button" class="ui-button" onClick={()=>{service.setText(EXAMPLE);setPage(0);}}>Use example grid</button>
    <button type="button" class="ui-button" disabled={view.state==="reading"||view.text.length===0} onClick={()=>{setPage(0);service.preview();}}>Preview songbook</button>
    <button type="button" class="ui-button" onClick={()=>{service.close();setPage(0);}}>Close songbook preview</button></div>
   <p role="status">{view.message}</p>
   {grid===null?null:<>
    <p>New section: <strong>{grid.title}</strong> · {grid.bars.length} bars. {grid.tempo===null?`No source tempo; use this chart’s ${String(view.tempo)} BPM.`:`Source tempo: ${String(grid.tempo)} BPM; chart: ${String(view.tempo)} BPM.`}</p>
    <p>{grid.comments} comment lines omitted. Chords use Balanced Auto voicing; the file supplies no exact voicing or sound. Existing chart title, notes and settings stay intact.</p>
    <ol start={page*8+1} aria-label="Expanded songbook bars">{shown.map((bar,i)=><li key={page*8+i}>{bar.map(e=>`${e.chord.sourceText} — ${String(e.quarters)} quarter ${e.quarters===1?"beat":"beats"}`).join("; ")}</li>)}</ol>
    {grid.bars.length>8?<div class="studio-songbook__actions"><button class="ui-button" type="button" disabled={page===0} onClick={()=>{setPage(page-1);}}>Previous eight bars</button><span>Bars {page*8+1}–{Math.min(page*8+8,grid.bars.length)}</span><button class="ui-button" type="button" disabled={(page+1)*8>=grid.bars.length} onClick={()=>{setPage(page+1);}}>Next eight bars</button></div>:null}
    <label class="studio-songbook__ack"><input type="checkbox" checked={view.acknowledged} disabled={view.state!=="ready"} onChange={e=>{service.acknowledge(e.currentTarget.checked);}} />Use one quarter beat per cell: dots continue the chord, slashes rearticulate it, and % copies the previous bar.</label>
    <button class="ui-button" type="button" disabled={view.state!=="ready"||!view.acknowledged} onClick={()=>{service.add();setPage(0);}}>Add song as new section</button>
   </>}
  </section>
 </details>;
}
