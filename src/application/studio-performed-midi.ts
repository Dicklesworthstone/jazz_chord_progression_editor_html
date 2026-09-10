import { beatValueToMidiTicks, type ValidatedDocument } from "../domain";
import { exportPerformedMidi } from "../export";
import { compilePerformancePlan, projectPlaybackPlanLoop, type PerformanceStyleId } from "../playback";
import { compileStudioPlaybackPlan, studioSectionLoopRange } from "./studio-playback";
import type { StudioMidiExportDeliveryStart, StudioMidiExportHashPort } from "./studio-midi-export";

export type StudioPerformedMidiView = Readonly<{
  state: "idle" | "preparing" | "ready" | "delivering" | "delivered" | "refused" | "stale";
  message: string;
  filename: string | null;
  bars: number;
  notes: number;
  byteLength: number;
  sha256: string | null;
  tempoMicroseconds: number | null;
  sections: readonly Readonly<{id:string;name:string}>[];
}>;
export type StudioPerformedMidiService = Readonly<{
  read: () => StudioPerformedMidiView;
  subscribe: (listener: () => void) => () => void;
  prepare: (sectionId: string | null) => Promise<StudioPerformedMidiView>;
  download: () => Promise<StudioPerformedMidiView>;
  cancel: () => StudioPerformedMidiView;
}>;

/** Private bytes, source authority and download lifecycle stay in application. */
export function createStudioPerformedMidi(ports:Readonly<{
  readDocument:()=>ValidatedDocument;
  readRevision:()=>number;
  readStyle:()=>PerformanceStyleId;
  hashBytes:StudioMidiExportHashPort;
  startDelivery:StudioMidiExportDeliveryStart;
}>):StudioPerformedMidiService {
  let generation=0;
  let view:Omit<StudioPerformedMidiView,"sections">={state:"idle",message:"Export the ballad arrangement for a passage of up to 16 bars.",filename:null,bars:0,notes:0,byteLength:0,sha256:null,tempoMicroseconds:null};
  const listeners = new Set<() => void>();
  const publish = (next: Omit<StudioPerformedMidiView,"sections">): void => { view = next; for (const listener of listeners) listener(); };
  const subscribe = (listener: () => void): (() => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  let prepared:Readonly<{document:ValidatedDocument;revision:number;style:PerformanceStyleId;bytes:Uint8Array}>|null=null;
  const read=():StudioPerformedMidiView=>{
    const stale=prepared!==null&&view.state==="ready"&&!same(prepared.document,prepared.revision,prepared.style);
    return Object.freeze({...view,...(stale?{state:"stale" as const,message:"The chart changed. Prepare the current passage again."}:{}),sections:Object.freeze(ports.readDocument().sections.map(s=>Object.freeze({id:s.id,name:s.name})))});
  };
  const same=(document:ValidatedDocument,revision:number,style:PerformanceStyleId):boolean=>ports.readDocument()===document&&ports.readRevision()===revision&&ports.readStyle()===style;
  const refuse=(message:string,state:"refused"|"stale"="refused"):StudioPerformedMidiView=>{
    prepared=null;publish({...view,state,message});return read();
  };
  const cancel=():StudioPerformedMidiView=>{
    if(view.state==="delivering")return read();
    generation+=1;prepared=null;publish({...view,state:"idle",message:"Preparation canceled. No file was downloaded.",filename:null,sha256:null});return read();
  };
  const prepare=async(sectionId:string|null):Promise<StudioPerformedMidiView>=>{
    if(view.state==="delivering")return read();
    const token=++generation,document=ports.readDocument(),revision=ports.readRevision(),style=ports.readStyle();
    prepared=null;publish({...view,state:"preparing",message:"Preparing the performed passage…",filename:null,sha256:null});
    if(style!=="ballad-comp@1"||document.meter.beatsPerBar!==4||document.meter.beatUnit!==4)return refuse("Performed MIDI currently supports Ballad comp in 4/4. Choose that groove or use literal MIDI export.");
    const selected=sectionId===null?document.sections:document.sections.filter(s=>s.id===sectionId);
    if(selected.length===0)return refuse("That section no longer exists. Choose a current passage.","stale");
    const bars=selected.reduce((n,s)=>n+s.measures.length,0);
    if(bars<1||bars>16)return refuse("Choose a passage containing 1–16 bars. Nothing has been shortened.");
    let sourceEvents=0;
    for(const s of document.sections)for(const m of s.measures){sourceEvents+=m.events.length;if(sourceEvents>128)return refuse("This export supports charts with at most 128 source chords. Literal MIDI remains available.");}
    const base=compileStudioPlaybackPlan(document);if(!base.ok)return refuse(base.refusal.message);
    const performed=compilePerformancePlan({plan:base.plan,styleId:style,compContinuityVersion:2});
    if(!performed.ok)return refuse(`The arrangement could not be prepared (${performed.refusal.code}). Nothing was substituted.`);
    const range=sectionId===null?null:studioSectionLoopRange(document,sectionId);
    if(sectionId!==null&&range===null)return refuse("That section has no exportable duration.");
    const projection=range===null?{ok:true as const,plan:performed.plan}:projectPlaybackPlanLoop(performed.plan,range);
    if(!projection.ok)return refuse(`The passage could not be prepared (${projection.refusal.code}).`);
    const plan=projection.plan,start=plan.loopTicks?.start??0,end=plan.loopTicks?.end??plan.totalTicks;
    if (plan.events.length === 0) return refuse("This passage has no sounded notes to export.");
    const textById=new Map(document.sections.flatMap(s=>s.measures.flatMap(m=>m.events.map(e=>[e.id,e.chord.sourceText] as const))));
    const markers:{tick:number;text:string;order:number}[]=[];
    for(const s of selected){const r=studioSectionLoopRange(document,s.id);if(r!==null)markers.push({tick:beatValueToMidiTicks(r.start),text:s.name,order:0});}
    for(const e of base.plan.events)if(e.startTick>=start&&e.startTick<end){const text=textById.get(e.eventId);if(text===undefined)return refuse("A source chord is no longer available.","stale");markers.push({tick:e.startTick,text,order:1});}
    markers.sort((a,b)=>a.tick-b.tick||a.order-b.order);
    const exported=exportPerformedMidi({plan,provenance:performed.eventProvenance,title:document.title,markers});
    if(!exported.ok)return refuse(exported.code==="performed-midi.channels"?"This passage needs more MIDI channels than the file can preserve. No voices were dropped.":exported.code==="performed-midi.limit"?"This performed passage exceeds the export limit. Choose a shorter section.":"This passage contains timing or text that cannot be exported exactly. Check the title and section names (1–96 UTF-8 bytes, no control characters).");
    let sha256:string;
    try{sha256=await ports.hashBytes(exported.bytes);}catch{if(token!==generation)return read();return refuse("This browser could not fingerprint the MIDI file. Nothing was downloaded.");}
    if(token!==generation)return read();
    if(!same(document,revision,style))return refuse("The chart changed during preparation. Prepare the current passage again.","stale");
    if(!/^[a-f0-9]{64}$/.test(sha256))return refuse("The browser returned an invalid file fingerprint.");
    prepared={document,revision,style,bytes:exported.bytes};
    publish({state:"ready",message:"Performed MIDI is ready. Its notes and timing match the selected arrangement.",filename:`changes-performed-${document.id.replace(/[^A-Za-z0-9._-]/g,"-").slice(0,40)}.mid`,bars,notes:exported.evidence.pitches,byteLength:exported.bytes.length,sha256,tempoMicroseconds:exported.tempoMicroseconds});
    return read();
  };
  const download=async():Promise<StudioPerformedMidiView>=>{
    if(view.state!=="ready"||prepared===null||view.filename===null||view.sha256===null)return read();
    const held=prepared, filename=view.filename, sha256=view.sha256;
    if(!same(held.document,held.revision,held.style))return refuse("The chart changed. Prepare the current passage again.","stale");
    publish({...view,state:"delivering",message:"Handing the performed MIDI file to your browser…"});
    try{
      const started=ports.startDelivery({binding:{kind:"standard-midi-file",sourceDocumentId:held.document.id,sourceRevision:held.revision,filename,byteLength:held.bytes.length,artifactSha256:sha256},privateBytes:held.bytes});
      const result=await started.completion;
      const accounting=result as Readonly<{objectUrlsCreated?:unknown;objectUrlsRevoked?:unknown;outstandingOwnedResources?:unknown}>|null;
      if(accounting===null||typeof accounting!=="object"||accounting.objectUrlsCreated!==1||accounting.objectUrlsRevoked!==1||accounting.outstandingOwnedResources!==0)return refuse("The browser received the file, but download cleanup could not be confirmed. Check downloads before trying again.");
    }catch{return refuse("The browser could not complete this download. Prepare again to retry.");}
    prepared=null;publish({...view,state:"delivered",message:"The performed MIDI file was handed to browser downloads. The browser reports whether it reached disk."});return read();
  };
  return Object.freeze({read,subscribe,prepare,download,cancel});
}
