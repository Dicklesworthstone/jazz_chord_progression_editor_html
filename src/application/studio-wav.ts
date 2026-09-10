import type {ValidatedDocument} from "../domain";
import type {DryPianoRenderPort} from "../audio";
import {encodePcm16Wav,type PrepareWavDownload} from "../export";
import {projectPlaybackPlanLoop} from "../playback";
import {compileStudioPlaybackPlan,studioSectionLoopRange} from "./studio-playback";
import type {StudioMidiExportHashPort} from "./studio-midi-export";
export type StudioWavView=Readonly<{
  state:"idle"|"rendering"|"hashing"|"cancelling"|"ready"|"delivered"|"refused"|"stale";busy:boolean;message:string;
  sectionId:string|null;sections:readonly Readonly<{id:string;name:string}>[];done:number;total:number;byteLength:number;sha256:string|null;
}>;
export type StudioWavService=Readonly<{read:()=>StudioWavView;subscribe:(listener:()=>void)=>()=>void;setPassage:(id:string|null)=>void;prepare:()=>Promise<void>;cancel:()=>void;download:()=>void}>;
export function createStudioWav(ports:Readonly<{
  readDocument:()=>ValidatedDocument;readRevision:()=>number;subscribeSource:(listener:()=>void)=>()=>void;
  render:DryPianoRenderPort;hashBytes:StudioMidiExportHashPort;prepareDownload:PrepareWavDownload;
}>):StudioWavService {
  let state:StudioWavView["state"]="idle",busy=false,cancelled=false,message="Choose a short passage to render as dry piano.",sectionId:string|null=null;
  let done=0,total=0,byteLength=0,sha256:string|null=null,deliver:ReturnType<PrepareWavDownload>|null=null;
  let binding:Readonly<{document:ValidatedDocument;revision:number}>|null=null;
  const listeners=new Set<()=>void>(),notify=():void=>{for(const listener of listeners)listener();};
  const same=():boolean=>binding!==null&&binding.document===ports.readDocument()&&binding.revision===ports.readRevision();
  const isCancelled=():boolean=>cancelled;
  const clear=():void=>{deliver=null;sha256=null;byteLength=0;};
  const read=():StudioWavView=>Object.freeze({state,busy,message,sectionId,sections:Object.freeze(ports.readDocument().sections.map(s=>Object.freeze({id:s.id,name:s.name}))),done,total,byteLength,sha256});
  const cancel=():void=>{cancelled=true;clear();state=busy?"cancelling":"idle";message=busy?"Cancelling after the current bounded render step…":"Piano render and prepared download cleared.";notify();};
  const fail=(text:string):void=>{clear();state="refused";message=text;notify();};
  const prepare=async():Promise<void>=>{
    if(busy)return;busy=true;cancelled=false;clear();done=0;total=0;
    const document=ports.readDocument();binding=Object.freeze({document,revision:ports.readRevision()});state="rendering";message="Preparing exact dry piano notes…";notify();
    try{
      const selected=sectionId===null?document.sections:document.sections.filter(s=>s.id===sectionId);
      const bars=selected.reduce((n,s)=>n+s.measures.length,0);
      if(selected.length===0||bars<1||bars>4){fail("Choose a whole chart or section of 1–4 bars.");return;}
      let measures=0,events=0;if(document.sections.length>32){fail("This export supports charts with up to 32 sections.");return;}
      for(const section of document.sections){measures+=section.measures.length;if(measures>128){fail("This export supports charts with up to 128 source bars.");return;}for(const measure of section.measures){events+=measure.events.length;if(events>128){fail("This export supports charts with up to 128 source chords.");return;}}}
      const base=compileStudioPlaybackPlan(document);if(!base.ok){fail(base.refusal.message);return;}
      const range=sectionId===null?null:studioSectionLoopRange(document,sectionId);if(sectionId!==null&&range===null){fail("That section has no renderable duration.");return;}
      const projection=range===null?base:projectPlaybackPlanLoop(base.plan,range);if(!projection.ok){fail("The selected passage could not be projected exactly.");return;}
      const rendered=await ports.render(projection.plan,{cancelled:()=>cancelled||!same(),progress:(finished,planned)=>{if(isCancelled()||!same())return;done=finished;total=planned;notify();}});
      if(isCancelled()||!same())return;if(!rendered.ok){fail(rendered.message);return;}
      const encoded=encodePcm16Wav(rendered.left,rendered.right);if(!encoded.ok){fail(encoded.message);return;}
      state="hashing";message="Preparing the WAV download…";notify();
      const hash=await ports.hashBytes(encoded.bytes);if(isCancelled()||!same())return;
      if(!/^[a-f0-9]{64}$/.test(hash)){fail("The browser returned an invalid file fingerprint.");return;}
      deliver=ports.prepareDownload(encoded.bytes,"changes-dry-piano.wav");sha256=hash;byteLength=encoded.bytes.length;state="ready";message="Dry piano WAV is ready. No live effects or accompaniment are included.";
    }catch{if(!isCancelled())fail("The piano file could not be prepared. Your chart is unchanged.");}
    finally{
      busy=false;
      if(isCancelled()||!same()){clear();state=same()?"idle":"stale";message=same()?"Piano render cancelled; no download prepared.":"The chart changed. Prepare its current notes again.";}
      notify();
    }
  };
  ports.subscribeSource(()=>{if(binding===null||same())return;cancelled=true;clear();state=busy?"cancelling":"stale";message="The chart changed. Previous piano work is cancelled.";notify();});
  return Object.freeze({read,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},prepare,cancel,
    setPassage:(id:string|null)=>{cancel();sectionId=id;message=busy?"Cancelling the previous passage…":"Passage updated. Prepare its dry piano notes.";notify();},
    download:()=>{
      if(busy||state!=="ready"||deliver===null)return;if(!same()){clear();state="stale";message="The chart changed. Prepare again.";notify();return;}
      const handoff=deliver;deliver=null;
      try{const receipt=handoff();if(!receipt.issued||receipt.objectUrlsCreated!==1||receipt.objectUrlsRevoked!==1||receipt.outstandingOwnedResources!==0){fail("Download or cleanup could not be confirmed. Check browser downloads before preparing again.");return;}state="delivered";message="Piano WAV handed to browser downloads.";}
      catch{fail("The browser could not finish the WAV download. Prepare again to retry.");return;}notify();
    },
  });
}
