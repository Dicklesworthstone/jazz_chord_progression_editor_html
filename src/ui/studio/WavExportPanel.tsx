import {useEffect,useState} from "preact/hooks";
import type {StudioWavService} from "../../application/runtime";
export function WavExportPanel({service}:{service:StudioWavService}){
  const [,render]=useState(0);useEffect(()=>{const unsubscribe=service.subscribe(()=>{render(n=>n+1);});render(n=>n+1);return()=>{unsubscribe();service.cancel();};},[service]);
  const view=service.read();
  return <details class="studio-wav" onToggle={e=>{if(!e.currentTarget.open)service.cancel();}}>
    <summary>Download piano audio</summary><section aria-label="Dry piano WAV" data-artifact-sha256={view.sha256??undefined}>
      <p>Render 1–4 bars, up to 16 seconds, as dry Concert Grand voicings. Stereo 32 kHz WAV. Your chart and selected instrument stay unchanged.</p>
      <p>This file omits live effects, accompaniment and separate external bass. It preserves exact saved notes in MIDI 21–108, with at most 64 note occurrences and four-second gates. It adds a short piano release and reduces peaks only when needed.</p>
      <label>Piano passage <select value={view.sectionId??""} onChange={e=>{service.setPassage(e.currentTarget.value||null);}}><option value="">Whole chart</option>{view.sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <div class="studio-wav__actions"><button type="button" disabled={view.busy} onClick={()=>{void service.prepare();}}>Prepare piano WAV</button><button type="button" disabled={!view.busy&&view.state!=="ready"} onClick={service.cancel}>Cancel piano WAV</button><button type="button" disabled={view.state!=="ready"||view.busy} onClick={service.download}>Download piano WAV</button></div>
      {view.busy?<progress aria-label="Piano notes rendered" value={view.done} max={Math.max(1,view.total)} />:null}
      <p role="status" aria-live="polite">{view.message}</p>{view.byteLength>0?<p>{Math.round(view.byteLength/1024)} KiB · changes-dry-piano.wav</p>:null}
    </section>
  </details>;
}
