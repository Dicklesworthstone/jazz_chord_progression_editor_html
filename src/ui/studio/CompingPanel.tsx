import {useEffect,useState} from "preact/hooks";
import type {StudioCompingService} from "../../application/runtime";
const LEVELS=["Off","Soft","Medium","Strong"];
const SUBDIVISIONS=["beat","e","and","a"];
export function CompingPanel({ports}:{ports:Readonly<{service:StudioCompingService;hear:(input:"pointer"|"keyboard")=>Promise<void>|undefined}>}) {
  const {service}=ports,[,render]=useState(0),[text,setText]=useState("");
  useEffect(()=>{const unsubscribe=service.subscribe(()=>{render(n=>n+1);});render(n=>n+1);return()=>{unsubscribe();void service.stop();};},[service]);
  const view=service.read(),busy=view.state==="preparing"||view.state==="delivering";
  return <details class="studio-comping" onToggle={event=>{if(!event.currentTarget.open)void service.stop();}}>
    <summary>Make a comping rhythm</summary>
    <section aria-label="Authored comping rhythm" data-artifact-sha256={view.sha256??undefined}>
      <p>Hear your exact chart voicings on a repeating one-bar grid. One pass of 1–4 complete 4/4 bars; no added bass or chord-arrival attacks.</p>
      <p>These session settings affect this audition and MIDI only. Ordinary Play, chart backups and shared links keep their existing settings. Save a separate recipe to keep this rhythm.</p>
      <label>Passage <select value={view.sectionId??""} disabled={busy} onChange={e=>{service.setPassage(e.currentTarget.value||null);}}>
        <option value="">Whole chart</option>
        {view.sectionId!==null&&!view.sections.some(s=>s.id===view.sectionId)?<option value={view.sectionId}>Previous section (unavailable)</option>:null}
        {view.sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
      </select></label>
      <div class="studio-comping__presets">{view.presets.map((p,i)=><button type="button" disabled={busy} key={p.name} onClick={()=>{service.setPreset(i);}}>{p.name}</button>)}</div>
      <p>Tap a slot to cycle Off → Soft → Medium → Strong.</p>
      <div class="studio-comping__grid" aria-label="Sixteenth-note rhythm grid">
        {view.recipe.slots.map((level,i)=><button key={i} type="button" disabled={busy} data-level={level} aria-label={`Beat ${String(Math.floor(i/4)+1)} ${SUBDIVISIONS[i%4]??""}: ${LEVELS[level]??""}`} aria-pressed={level>0} onClick={()=>{service.setSlot(i);}}>
          <span>{i%4===0?Math.floor(i/4)+1:SUBDIVISIONS[i%4]}</span><small>{LEVELS[level]}</small>
        </button>)}
      </div>
      <label>Maximum note length <select value={view.recipe.gateTicks} disabled={busy} onChange={e=>{service.setGate(Number(e.currentTarget.value));}}>
        <option value="120">Short (1/32 note)</option><option value="240">Medium (1/16 note)</option><option value="480">Long (1/8 note)</option>
      </select></label>
      <p>Notes end sooner at the next attack, chord boundary or passage end. Instrument release tails can continue after note-off.</p>
      <div class="studio-comping__actions">
        <button type="button" disabled={busy} onClick={e=>{void ports.hear(e.detail===0?"keyboard":"pointer");}}>Hear rhythm</button>
        <button type="button" onClick={()=>{void service.stop();}}>Stop rhythm</button>
        <button type="button" disabled={busy} onClick={()=>{service.setPreset(0);}}>Restore default rhythm</button>
        <button type="button" disabled={busy} onClick={()=>{void service.prepareMidi();}}>Prepare rhythm MIDI</button>
        <button type="button" disabled={view.state!=="ready"} onClick={()=>{void service.downloadMidi();}}>Download rhythm MIDI</button>
      </div>
      <p role="status" aria-live="polite">{view.message}</p>
      {view.attacks>0?<p>{view.attacks} attacks · {view.notes} note occurrences. MIDI retains gates and accents; the receiving instrument supplies its sound. Tempo is rounded to microseconds per quarter note.</p>:null}
      <details><summary>Save or open a rhythm recipe</summary>
        <button type="button" disabled={busy} onClick={()=>{service.downloadRecipe();}}>Download rhythm recipe</button>
        <label>Open recipe file<input type="file" accept="application/json,.json" disabled={busy} onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";setText("");if(file!==undefined)void service.previewRecipeFile(file);}} /></label>
        <label>Paste recipe JSON<textarea value={text} maxLength={2048} disabled={busy} onInput={e=>{setText(e.currentTarget.value);service.previewRecipe(e.currentTarget.value);}} /></label>
        {view.importDraft===null?null:<p>Preview: {view.importDraft.slots.filter(n=>n>0).length} active slots · {view.importDraft.gateTicks}/960 beat maximum gate.</p>}
        <button type="button" disabled={busy||view.importDraft===null} onClick={()=>{service.applyRecipe();}}>Apply recipe to session</button>
      </details>
    </section>
  </details>;
}
