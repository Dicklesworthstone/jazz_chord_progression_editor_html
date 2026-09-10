import {expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {createStudioCompositionOverState} from "../../src/application/studio-controller";
import {loopArrangementFixture} from "../support/loop-arrangement-fixture";
import {parseStableId,type StableIdFactory} from "../../src/domain";
const text=readFileSync("tests/fixtures/chordpro-grid/turnaround.crd","utf8").replace("{tempo: 120}","{tempo: 240}");
const setup=()=>{const f=loopArrangementFixture();return createStudioCompositionOverState(f.state,f.dependencies);};
const file=(source:string)=>({size:new TextEncoder().encode(source).length,arrayBuffer:()=>Promise.resolve(new TextEncoder().encode(source).buffer)});
test("real composition previews without IDs or mutation and adds all bars in one exact undoable command",()=>{
 const c=setup(),before=c.readApplicationState(),s=c.songbook;s.setText(text);s.preview();expect(s.read().state).toBe("ready");expect(c.readApplicationState()).toBe(before);
 s.add();expect(c.readApplicationState()).toBe(before);s.acknowledge(true);s.add();const after=c.readApplicationState();expect(after.revision).toBe(before.revision+1);expect(after.document.title).toBe(before.document.title);expect(after.document.playback).toEqual(before.document.playback);expect(after.document.sections.slice(0,2)).toEqual([...before.document.sections]);
 const section=after.document.sections[2];expect(section?.name).toBe("Flat-side study");expect(section?.voiceLeadingBoundary).toBe("reset");expect(section?.measures.map(m=>m.events.map(e=>[e.chord.sourceText,e.duration.numerator,e.duration.denominator]))).toEqual([[["Dbmaj7",2,1],["Ab7",2,1]],[["Gbmaj7",1,1],["Gbmaj7",2,1],["Dbmaj7",1,1]],[["Gbmaj7",1,1],["Gbmaj7",2,1],["Dbmaj7",1,1]],[["Ebm7",2,1],["Ab7",2,1]]]);
 const ids=section?.measures.flatMap(m=>[m.id,...m.events.map(e=>e.id)])??[];expect(new Set(ids).size).toBe(14);expect(section?.measures.flatMap(m=>m.events).every(e=>e.voicing.mode==="auto")).toBe(true);
 expect(c.controller.undo().ok).toBe(true);expect(c.readApplicationState().document).toEqual(before.document);expect(c.controller.redo().ok).toBe(true);expect(c.readApplicationState().document).toEqual(after.document);
});
test("direct insertion recomputes source, requires consent, and rejects mismatches without changing history",()=>{
 const c=setup(),before=c.readApplicationState(),source={documentId:before.document.id,revision:before.revision};
 for(const [binding,input,ack]of [[source,text,false],[{...source,revision:source.revision+1},text,true],[{...source,documentId:"other"},text,true],[source,text.replace("240","120"),true],[source,text+"\n{include: bad}",true]] as const){expect(c.controller.insertSongbook(binding,input,ack).ok).toBe(false);expect(c.readApplicationState().document).toBe(before.document);expect(c.readApplicationState().history).toBe(before.history);}
});
test("file and paste use the same decoder; missing tempo uses existing chart and comments are disclosed",async()=>{
 const c=setup(),s=c.songbook,input=text.replace("{tempo: 240}\n","");await s.previewFile(file(input));expect(s.read().state).toBe("ready");const fromFile=s.read().result;s.setText(input);s.preview();expect(s.read().result).toEqual(fromFile);expect(s.read().tempo).toBe(240);expect(s.read().result).toMatchObject({grid:{comments:1,tempo:null}});
});
test("pending file cannot attach itself to an edited chart or supersede a newer paste, file or close",async()=>{
 for(const action of ["edit","paste","file","close"]){
  const c=setup(),s=c.songbook;let release:((value:ArrayBuffer)=>void)|undefined;
  const pending=s.previewFile({size:10,arrayBuffer:()=>new Promise<ArrayBuffer>(r=>{release=r;})});expect(s.read().state).toBe("reading");
  if(action==="edit")c.controller.setTitle("Changed");else if(action==="paste"){s.setText(text);s.preview();}else if(action==="file")await s.previewFile(file(text));else s.close();
  const current=s.read();release?.(new TextEncoder().encode(text.replace("Flat-side study","Old file")).buffer);await pending;expect(s.read()).toEqual(current);
 }
});
test("file bytes are bounded before and after reading and decoded with fatal UTF-8",async()=>{
 const c=setup(),s=c.songbook,before=c.readApplicationState();let reads=0;
 await s.previewFile({size:16385,arrayBuffer:()=>{reads++;return Promise.resolve(new ArrayBuffer(0));}});expect(reads).toBe(0);expect(s.read().state).toBe("refused");
 for(const bytes of [new Uint8Array(16385),new Uint8Array([0xc3,0x28])]){await s.previewFile({size:1,arrayBuffer:()=>Promise.resolve(bytes.buffer)});expect(s.read().state).toBe("refused");expect(s.read().result).toBeNull();}
 expect(c.readApplicationState()).toBe(before);
});
test("edits invalidate previews and acknowledgement; a second Add cannot duplicate a song",()=>{
 const c=setup(),s=c.songbook;s.setText(text);s.preview();s.acknowledge(true);c.controller.setTitle("New title");expect(s.read().state).toBe("stale");expect(s.read().acknowledged).toBe(false);s.add();expect(c.readApplicationState().document.sections.length).toBe(2);
 s.preview();s.acknowledge(true);s.add();const after=c.readApplicationState();s.add();expect(c.readApplicationState()).toBe(after);expect(after.document.sections.length).toBe(3);
});
test("colliding identities refuse the whole section, preserving prior music and history",()=>{
 const f=loopArrangementFixture();const stableIdFactory:StableIdFactory={next:kind=>{const id=parseStableId(kind,"loop-section-0");return id.ok?{ok:true,value:id.value,source:"deterministic-test"}:{ok:false,refusal:{code:"id.factory_exhausted",kind,path:["id"]}};}};
 const c=createStudioCompositionOverState(f.state,{...f.dependencies,stableIdFactory}),before=c.readApplicationState();expect(c.controller.insertSongbook({documentId:before.document.id,revision:before.revision},text,true).ok).toBe(false);expect(c.readApplicationState().document).toBe(before.document);expect(c.readApplicationState().history).toBe(before.history);
});
test("a non-4/4 destination refuses instead of changing meter or approximating durations",()=>{
 const c=setup();expect(c.controller.clearChart().ok).toBe(true);expect(c.controller.setMeter(3,4).ok).toBe(true);const before=c.readApplicationState();c.songbook.setText(text);c.songbook.preview();expect(c.songbook.read().state).toBe("refused");expect(c.songbook.read().message).toContain("4/4 destination");c.songbook.acknowledge(true);c.songbook.add();expect(c.readApplicationState()).toBe(before);
});
