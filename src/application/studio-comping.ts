import {beatValueToMidiTicks,type ValidatedDocument} from "../domain";
import {COMP_PRESETS,compileAuthoredComping,decodeCompRecipe,parseCompRecipe,type CompRecipe,type CompResult,type PlaybackPlan} from "../playback";
import {exportPerformedMidi} from "../export";
import {compileStudioPlaybackPlan,studioSectionLoopRange} from "./studio-playback";
import type {StudioAudioGesture} from "./studio-audio";
import type {StudioInspectorResult} from "./studio-inspector";
import type {StudioMidiExportDeliveryStart,StudioMidiExportHashPort} from "./studio-midi-export";

export type StudioCompingView=Readonly<{
  recipe:CompRecipe;presets:typeof COMP_PRESETS;sectionId:string|null;sections:readonly Readonly<{id:string;name:string}>[];
  state:"idle"|"preparing"|"ready"|"delivering"|"delivered"|"refused"|"stale";message:string;
  importDraft:CompRecipe|null;attacks:number;notes:number;sha256:string|null;filename:string|null;
}>;
export type StudioCompingService=Readonly<{
  read:()=>StudioCompingView;subscribe:(listener:()=>void)=>()=>void;
  setSlot:(slot:number)=>void;setGate:(ticks:number)=>void;setPreset:(index:number)=>void;setPassage:(id:string|null)=>void;
  previewRecipe:(text:string)=>void;previewRecipeFile:(file:Readonly<{size:number;text:()=>Promise<string>}>)=>Promise<void>;applyRecipe:()=>void;downloadRecipe:()=>void;
  hear:(gesture:StudioAudioGesture)=>Promise<void>;stop:()=>Promise<void>;prepareMidi:()=>Promise<void>;downloadMidi:()=>Promise<void>;
}>;
type Snapshot=Readonly<{document:ValidatedDocument;revision:number;result:Extract<CompResult,{ok:true}>}>;
/** Session settings and immutable musical snapshot; UI never owns file/audio adapters. */
export function createStudioComping(ports:Readonly<{
  readDocument:()=>ValidatedDocument;readRevision:()=>number;subscribeSource:(listener:()=>void)=>()=>void;
  preview:(plan:PlaybackPlan,gesture:StudioAudioGesture)=>Promise<StudioInspectorResult<void>>;
  release:()=>Promise<StudioInspectorResult<void>>;
  hashBytes:StudioMidiExportHashPort;startDelivery:StudioMidiExportDeliveryStart;
  prepareRecipeDownload:(text:string,filename:string)=>()=>boolean;
}>):StudioCompingService {
  const initial=COMP_PRESETS[0];if(initial===undefined)throw new Error("Missing comp preset");
  let recipe=initial.recipe,sectionId:string|null=null,importDraft:CompRecipe|null=null,generation=0,importGeneration=0;
  let state:StudioCompingView["state"]="idle",message="Choose 1–4 complete bars, then hear your rhythm.",snapshot:Snapshot|null=null;
  let bytes:Uint8Array|null=null,sha256:string|null=null,filename:string|null=null;
  const listeners=new Set<()=>void>(),notify=():void=>{for(const listener of listeners)listener();};
  const same=(s:Snapshot):boolean=>s.document===ports.readDocument()&&s.revision===ports.readRevision();
  const read=():StudioCompingView=>{
    const stale=snapshot!==null&&!same(snapshot);
    return Object.freeze({recipe,presets:COMP_PRESETS,sectionId,sections:Object.freeze(ports.readDocument().sections.map(s=>Object.freeze({id:s.id,name:s.name}))),
      state:stale&&state!=="delivering"?"stale":state,message:stale?"The chart changed. Hear or prepare the current passage again.":message,
      importDraft,attacks:snapshot?.result.evidence.attacks??0,notes:snapshot?.result.evidence.pitchOccurrences??0,sha256,filename});
  };
  const subscribe=(listener:()=>void):(()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
  const clear=():void=>{generation+=1;importGeneration+=1;snapshot=null;bytes=null;sha256=null;filename=null;state="idle";};
  const fail=(text:string):null=>{state="refused";message=text;notify();return null;};
  const change=(operation:()=>void):void=>{
    if(state==="delivering")return;clear();void ports.release();operation();message="Session rhythm updated. Hear or prepare this version.";notify();
  };
  const getSnapshot=():Snapshot|null=>{
    if(snapshot!==null&&same(snapshot))return snapshot;
    snapshot=null;
    const document=ports.readDocument(),revision=ports.readRevision(),selected=sectionId===null?document.sections:document.sections.filter(s=>s.id===sectionId);
    if(selected.length===0)return fail("That section no longer exists. Choose a current passage.");
    const measures=selected.flatMap(s=>s.measures);
    if(document.meter.beatsPerBar!==4||document.meter.beatUnit!==4||measures.length<1||measures.length>4||measures.some(m=>m.completion.kind!=="complete"&&m.completion.kind!=="empty"))return fail("Choose 1–4 complete 4/4 bars. Pickups and incomplete bars are not shortened or filled.");
    let count=0;for(const s of document.sections)for(const m of s.measures){count+=m.events.length;if(count>128)return fail("This tool supports charts with at most 128 source chords.");}
    const base=compileStudioPlaybackPlan(document);if(!base.ok)return fail(base.refusal.message);
    const range=sectionId===null?null:studioSectionLoopRange(document,sectionId);if(sectionId!==null&&range===null)return fail("That passage has no duration.");
    const result=compileAuthoredComping(base.plan,recipe,range===null?0:beatValueToMidiTicks(range.start),range===null?base.plan.totalTicks:beatValueToMidiTicks(range.end));
    if(!result.ok)return fail(result.code==="comp.empty"?"No notes fall on the active slots. Your draft is retained; add a slot or choose another passage.":`This rhythm could not be prepared (${result.code}). Nothing was substituted.`);
    snapshot=Object.freeze({document,revision,result});return snapshot;
  };
  const stop=async():Promise<void>=>{if(state==="delivering"){await ports.release();return;}clear();message="Rhythm audition and preparation stopped.";notify();await ports.release();};
  const hear=async(gesture:StudioAudioGesture):Promise<void>=>{
    if(state==="delivering")return;const s=getSnapshot();if(s===null)return;const token=++generation;state="idle";bytes=null;sha256=null;filename=null;
    message="Preparing the exact rhythm audition…";notify();
    const result=await ports.preview(s.result.plan,gesture);
    if(token!==generation)return;
    if(!same(s)){await ports.release();state="stale";message="The chart changed. Audition canceled.";}
    else message=result.ok?"Playing one pass of the authored comp rhythm.":result.message;
    notify();
  };
  const prepareMidi=async():Promise<void>=>{
    if(state==="delivering")return;const token=++generation;bytes=null;sha256=null;filename=null;
    const s=getSnapshot();if(s===null)return;state="preparing";message="Preparing MIDI from this exact rhythm…";notify();
    const exported=exportPerformedMidi({plan:s.result.plan,provenance:s.result.provenance,title:s.document.title,markers:[]});
    if(!exported.ok){fail(`MIDI cannot preserve this passage (${exported.code}). No voices were dropped.`);return;}
    let hash:string;try{hash=await ports.hashBytes(exported.bytes);}catch{if(token===generation)fail("This browser could not fingerprint the MIDI file.");return;}
    if(token!==generation)return;
    if(!same(s)){state="stale";message="The chart changed during preparation. Prepare again.";notify();return;}
    if(!/^[a-f0-9]{64}$/.test(hash)){fail("Invalid MIDI fingerprint; no file was prepared.");return;}
    bytes=exported.bytes;sha256=hash;filename="changes-comp-rhythm.mid";state="ready";message="The exact rhythm MIDI is ready to download.";notify();
  };
  const downloadMidi=async():Promise<void>=>{
    const s=snapshot;if(state!=="ready"||s===null||bytes===null||sha256===null||filename===null)return;
    if(!same(s)){state="stale";message="The chart changed. Prepare MIDI again.";notify();return;}
    state="delivering";message="Handing the rhythm MIDI to browser downloads…";notify();
    try{
      const delivery=ports.startDelivery({binding:{kind:"standard-midi-file",sourceDocumentId:s.document.id,sourceRevision:s.revision,filename,byteLength:bytes.length,artifactSha256:sha256},privateBytes:bytes});
      const cleanup=await delivery.completion as Readonly<{objectUrlsCreated?:unknown;objectUrlsRevoked?:unknown;outstandingOwnedResources?:unknown}>|null;
      bytes=null;
      if(cleanup===null||typeof cleanup!=="object"||cleanup.objectUrlsCreated!==1||cleanup.objectUrlsRevoked!==1||cleanup.outstandingOwnedResources!==0){fail("Download cleanup could not be confirmed. Check browser downloads before preparing again.");return;}
      state="delivered";message="Rhythm MIDI handed to browser downloads.";notify();
    }catch{bytes=null;fail("The browser could not finish the download. Prepare again to retry.");}
  };
  // Composition lifetime matches the controller lifetime. Invalidate before an
  // async instrument continuation can submit the previous document's notes.
  ports.subscribeSource(()=>{
    if(snapshot===null||same(snapshot))return;
    const delivering=state==="delivering";
    clear();
    state=delivering?"delivering":"stale";
    message=delivering?"The previous rhythm file is already being handed to the browser.":"The chart changed. Rhythm audition and preparation canceled.";
    void ports.release();notify();
  });
  const showRecipe=(text:string):void=>{
    importDraft=parseCompRecipe(text);
    message=importDraft===null?"Recipe not recognized. Use a version 1 recipe with 16 slots and an allowed gate.":"Valid recipe preview. Apply it to replace only the session rhythm.";
    notify();
  };
  const previewRecipeFile=async(file:Readonly<{size:number;text:()=>Promise<string>}>):Promise<void>=>{
    if(state==="delivering")return;
    const token=++importGeneration;importDraft=null;
    if(!Number.isSafeInteger(file.size)||file.size<0||file.size>2048){message="Recipe files must be at most 2,048 bytes. Your rhythm is unchanged.";notify();return;}
    message="Reading the rhythm recipe…";notify();
    try{const text=await file.text();if(token===importGeneration)showRecipe(text);}
    catch{if(token===importGeneration){message="This file could not be read. Your rhythm is unchanged.";notify();}}
  };
  return Object.freeze({read,subscribe,hear,stop,prepareMidi,downloadMidi,previewRecipeFile,
    setSlot:(slot:number):void=>{if(!Number.isInteger(slot)||slot<0||slot>=16)return;change(()=>{recipe=Object.freeze({...recipe,slots:Object.freeze(recipe.slots.map((v,i)=>i===slot?(v+1)%4:v))});});},
    setGate:(ticks:number):void=>{const next=decodeCompRecipe({...recipe,gateTicks:ticks});if(next!==null)change(()=>{recipe=next;});},
    setPreset:(index:number):void=>{const preset=COMP_PRESETS[index];if(preset!==undefined)change(()=>{recipe=preset.recipe;});},
    setPassage:(id:string|null):void=>{change(()=>{sectionId=id;});},
    previewRecipe:(text:string):void=>{if(state==="delivering")return;importGeneration+=1;showRecipe(text);},
    applyRecipe:():void=>{const held=importDraft;if(held!==null)change(()=>{recipe=held;importDraft=null;});},
    downloadRecipe:():void=>{try{const deliver=ports.prepareRecipeDownload(JSON.stringify(recipe,null,2)+"\n","changes-comp-recipe.json");message=deliver()?"Recipe handed to browser downloads. It is separate from chart backups and shared links.":"Recipe download was not confirmed. Try again from this button.";}catch{message="This browser could not download the recipe.";}notify();},
  });
}
