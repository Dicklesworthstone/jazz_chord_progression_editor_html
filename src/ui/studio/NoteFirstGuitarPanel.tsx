import {useMemo,useState} from "preact/hooks";
import type {StudioController,StudioNoteFirstDraft} from "../../application/runtime";
import {GuitarPositionResults} from "./GuitarPositionsPanel";

export function NoteFirstGuitarPanel({draft,stale,read,hear,release}:Readonly<{
  draft:StudioNoteFirstDraft;stale:boolean;read:StudioController["readNoteFirstGuitar"];
  hear:(input:"pointer"|"keyboard")=>void;release:()=>void;
}>){
  const [open,setOpen]=useState(false);
  const {documentId,revision}=draft.source,text=draft.text;
  const result=useMemo(()=>open&&!stale?read({documentId,revision},text):null,[open,stale,read,documentId,revision,text]);
  return <details class="studio-guitar studio-note-first-guitar" onToggle={e=>{setOpen(e.currentTarget.open);if(!e.currentTarget.open)release();}}>
    <summary>On guitar — draft notes</summary>
    <section aria-label="Draft guitar positions">
      <p>Your draft notes · standard tuning E2 A2 D3 G3 B3 E4 · frets 0–20. Positions preserve every note; they are not guaranteed comfortable fingerings.</p>
      {stale?<p role="alert">The chart changed. Analyze the draft again before viewing its guitar positions.</p>
        :result!==null&&!result.ok?<p role="alert">{result.message}</p>
        :result?.ok===true?<GuitarPositionResults search={result.value.search} hear={hear} release={release} />:null}
    </section>
  </details>;
}
