import type {ValidatedDocument,SpelledPitch} from "../domain";
import type {PlaybackEvent} from "../playback";
import {compileStudioPlaybackPlan} from "./studio-playback";
import type {StudioInspectorSource,StudioInspectorResult} from "./studio-inspector";
export type StudioPadEntry=Readonly<{event:PlaybackEvent;symbol:string;externalBass:boolean}>;
export type StudioPadEvidence=Readonly<{sections:number;measures:number;events:number;pitches:number;termination:"complete"|"input-refused"}>;
export type StudioPadCatalog=Readonly<{ok:true;entries:readonly StudioPadEntry[];sections:readonly Readonly<{id:string;name:string}>[];evidence:StudioPadEvidence}>|Readonly<{ok:false;message:string;evidence:StudioPadEvidence}>;
export type StudioPadsView=Readonly<{
  documentId:string;revision:number;sectionId:string;sections:readonly Readonly<{id:string;name:string}>[];page:number;pageCount:number;total:number;
  pads:readonly Readonly<{source:StudioInspectorSource;symbol:string;pitches:readonly SpelledPitch[];externalBass:boolean}>[];evidence:StudioPadEvidence;
}>;
/** Full-context P0 notes cached by the controller under immutable document identity. */
export function buildStudioPadCatalog(document:ValidatedDocument):StudioPadCatalog {
  let sections=0,measures=0,events=0,pitches=0;
  const evidence=(termination:StudioPadEvidence["termination"]):StudioPadEvidence=>Object.freeze({sections,measures,events,pitches,termination});
  const refuse=(message:string):StudioPadCatalog=>Object.freeze({ok:false,message,evidence:evidence("input-refused")});
  if(document.sections.length>32)return refuse("Chord pads support charts with up to 32 sections.");
  const originals=new Map<string,Readonly<{symbol:string;externalBass:boolean}>>();
  for(const section of document.sections){sections+=1;if(measures+section.measures.length>128)return refuse("Chord pads support charts with up to 128 bars.");
    for(const measure of section.measures){measures+=1;if(events+measure.events.length>128)return refuse("Chord pads support charts with up to 128 chords.");
      for(const event of measure.events){events+=1;originals.set(event.id,Object.freeze({symbol:event.chord.sourceText,externalBass:event.voicing.bassPolicy==="external"}));}
    }
  }
  const compiled=compileStudioPlaybackPlan(document);if(!compiled.ok)return refuse(compiled.refusal.message);
  const entries:StudioPadEntry[]=[];
  for(const event of compiled.plan.events){const original=originals.get(event.eventId);if(original===undefined||event.pitches.length>16)return refuse("The exact pad notes are unavailable. Nothing was substituted.");
    pitches+=event.pitches.length;entries.push(Object.freeze({event,...original}));
  }
  return Object.freeze({ok:true,entries:Object.freeze(entries),sections:Object.freeze(document.sections.map(s=>Object.freeze({id:s.id,name:s.name}))),evidence:evidence("complete")});
}
export function projectStudioPads(catalog:StudioPadCatalog,documentId:string,revision:number,sectionId:string|null,page:number):StudioInspectorResult<StudioPadsView>{
  if(!catalog.ok)return {ok:false,code:"pads.unavailable",message:catalog.message};
  const section=catalog.sections.find(s=>s.id===(sectionId??catalog.sections[0]?.id));
  if(section===undefined)return {ok:false,code:"pads.section",message:"Choose a current chart section."};
  const entries=catalog.entries.filter(e=>e.event.sectionId===section.id),pageCount=Math.max(1,Math.ceil(entries.length/16));
  if(!Number.isSafeInteger(page)||page<0||page>=pageCount)return {ok:false,code:"pads.page",message:"Choose a current page of chords."};
  return Object.freeze({ok:true,value:Object.freeze({documentId,revision,sectionId:section.id,sections:catalog.sections,page,pageCount,total:entries.length,evidence:catalog.evidence,
    pads:Object.freeze(entries.slice(page*16,(page+1)*16).map(entry=>Object.freeze({source:Object.freeze({documentId,revision,eventId:entry.event.eventId}),symbol:entry.symbol,pitches:entry.event.pitches,externalBass:entry.externalBass}))),
  })});
}
