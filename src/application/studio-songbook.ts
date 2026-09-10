import type {ValidatedDocument} from "../domain";
import {decodeChordProGrid,type GridResult} from "../theory";
import type {StudioControllerActionResult} from "./studio-controller";
export type SongbookSource=Readonly<{documentId:string;revision:number}>;
export type SongbookView=Readonly<{state:"idle"|"reading"|"ready"|"refused"|"stale";text:string;result:GridResult|null;acknowledged:boolean;message:string;tempo:number}>;
export type StudioSongbookService=Readonly<{read:()=>SongbookView;subscribe:(listener:()=>void)=>()=>void;setText:(text:string)=>void;preview:()=>void;previewFile:(file:Readonly<{size:number;arrayBuffer:()=>Promise<ArrayBuffer>}>)=>Promise<void>;acknowledge:(value:boolean)=>void;add:()=>void;close:()=>void}>;
export function songbookDestinationRefusal(document:ValidatedDocument,result:GridResult):string|null{
 if(!result.ok)return `Line ${String(result.line)}: ${result.message}`;
 if(document.meter.beatsPerBar!==4||document.meter.beatUnit!==4)return "This import needs a 4/4 destination chart. Its meter will not be changed.";
 if(result.grid.tempo!==null&&result.grid.tempo!==document.tempoBpm)return `The song specifies ${String(result.grid.tempo)} BPM; this chart is ${String(document.tempoBpm)} BPM. Match the chart tempo yourself, then preview again.`;
 return null;
}
export function createStudioSongbook(ports:Readonly<{readDocument:()=>ValidatedDocument;readRevision:()=>number;subscribeSource:(listener:()=>void)=>()=>void;insert:(source:SongbookSource,text:string,ack:boolean)=>StudioControllerActionResult}>):StudioSongbookService{
 let state:SongbookView["state"]="idle",text="",result:GridResult|null=null,acknowledged=false,message="Preview one ChordPro grid before adding it.",generation=0;
 let binding:Readonly<{document:ValidatedDocument;source:SongbookSource}>|null=null;
 const listeners=new Set<()=>void>(),notify=():void=>{for(const listener of listeners)listener();};
 const same=():boolean=>binding!==null&&binding.document===ports.readDocument()&&binding.source.revision===ports.readRevision();
 const clear=():void=>{generation++;result=null;acknowledged=false;binding=null;};
 const capture=():void=>{binding={document:ports.readDocument(),source:{documentId:ports.readDocument().id,revision:ports.readRevision()}};};
 const show=():void=>{result=decodeChordProGrid(text);const refusal=songbookDestinationRefusal(ports.readDocument(),result);state=refusal===null?"ready":"refused";message=refusal??"Review every expanded bar and acknowledge the timing interpretation before Add.";notify();};
 const close=():void=>{clear();text="";state="idle";message="Songbook preview closed.";notify();};
 ports.subscribeSource(()=>{if(binding===null||same())return;clear();state="stale";message="The chart changed. Preview the source again.";notify();});
 return Object.freeze({read:()=>Object.freeze({state,text,result,acknowledged,message,tempo:ports.readDocument().tempoBpm}),subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},close,
  setText:(value:string)=>{clear();text=value.length<=16384?value:"";state=value.length<=16384?"idle":"refused";message=value.length<=16384?"Source changed. Preview before adding.":"Source exceeds 16,384 characters.";notify();},
  preview:()=>{clear();capture();show();},
  previewFile:async(file)=>{clear();text="";capture();const token=generation;
   if(!Number.isSafeInteger(file.size)||file.size<0||file.size>16384){state="refused";message="Choose a UTF-8 songbook file of at most 16,384 bytes.";notify();return;}
   state="reading";message="Reading the local songbook file…";notify();
   try{const bytes=await file.arrayBuffer();if(token!==generation||!same())return;if(bytes.byteLength>16384)throw new Error("File exceeds 16,384 bytes.");text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);show();}
   catch{if(token!==generation)return;result=null;state="refused";message="The file could not be read as bounded UTF-8. The chart is unchanged.";notify();}},
  acknowledge:(value:boolean)=>{acknowledged=state==="ready"&&value;notify();},
  add:()=>{if(state!=="ready"||!same()||binding===null||!acknowledged)return;const source=binding.source;const outcome=ports.insert(source,text,acknowledged);if(outcome.ok){close();message="Added the song as one new section. One Undo removes it.";}else{state="refused";message=outcome.refusal.message;}notify();},
 });
}
