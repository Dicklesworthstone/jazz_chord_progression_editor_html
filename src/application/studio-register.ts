import {observeVoicingRegister,type RegisterObservationResult} from "../theory";
import {projectChordInspectorViewModel} from "./chord-inspector";
import {inspectorSourceEvent,type StudioInspectorSource,type StudioInspectorResult} from "./studio-inspector";
import type {AppState} from "./application-state-contract";

export type StudioRegisterView=Readonly<{source:StudioInspectorSource;observations:RegisterObservationResult;externalBass:boolean}>;
export function readStudioRegister(state:AppState,source:StudioInspectorSource):StudioInspectorResult<StudioRegisterView>{
  const selected=inspectorSourceEvent(state,source);if(!selected.ok)return selected;
  const event=selected.value;
  const detail=projectChordInspectorViewModel({...state,bookmarks:{...state.bookmarks,
    selection:{kind:"events",anchorEventId:event.id,focusEventId:event.id,eventIds:[event.id]},
  }},{includeMotion:false});
  const failure=detail.voicing.realizationFailure;
  if(failure!==null)return {ok:false,code:failure.code,message:failure.message};
  return Object.freeze({ok:true,value:Object.freeze({source:Object.freeze({...source}),observations:observeVoicingRegister(detail.voicing.activePitches),externalBass:event.voicing.bassPolicy==="external"})});
}
