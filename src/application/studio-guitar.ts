import {analyzeNoteFirst,findExactGuitarPositions,type GuitarPositionSearch} from "../theory";
import {projectChordInspectorViewModel} from "./chord-inspector";
import {inspectorSourceEvent,type StudioInspectorSource,type StudioInspectorResult} from "./studio-inspector";
import type {AppState} from "./application-state-contract";
import type {StudioNoteFirstSource} from "./studio-note-first";

export type StudioGuitarView=Readonly<{source:StudioInspectorSource;search:GuitarPositionSearch;externalBass:boolean}>;
export type StudioNoteFirstGuitarView=Readonly<{source:StudioNoteFirstSource;text:string;search:GuitarPositionSearch}>;
/** Draft-only selector: the selected chart chord never supplies these notes. */
export function readNoteFirstGuitar(state:AppState,source:StudioNoteFirstSource,text:string):StudioInspectorResult<StudioNoteFirstGuitarView>{
  if(source.documentId!==state.document.id||source.revision!==state.revision)return {ok:false,code:"note-first.stale",message:"The chart changed. Analyze the draft again before viewing its guitar positions."};
  const analysis=analyzeNoteFirst(text);if(!analysis.ok)return {ok:false,code:analysis.code,message:analysis.message};
  return Object.freeze({ok:true,value:Object.freeze({source:Object.freeze({...source}),text:analysis.normalizedText,search:findExactGuitarPositions(analysis.pitches)})});
}
export function readStudioGuitar(state:AppState,source:StudioInspectorSource):StudioInspectorResult<StudioGuitarView>{
  const selected=inspectorSourceEvent(state,source);if(!selected.ok)return selected;
  const event=selected.value;
  const detail=projectChordInspectorViewModel({...state,bookmarks:{...state.bookmarks,
    selection:{kind:"events",anchorEventId:event.id,focusEventId:event.id,eventIds:[event.id]},
  }},{includeMotion:false});
  const failure=detail.voicing.realizationFailure;
  if(failure!==null)return {ok:false,code:failure.code,message:failure.message};
  return Object.freeze({ok:true,value:Object.freeze({source:Object.freeze({...source}),search:findExactGuitarPositions(detail.voicing.activePitches),externalBass:event.voicing.bassPolicy==="external"})});
}
