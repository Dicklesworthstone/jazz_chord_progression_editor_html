import {expect,test} from "bun:test";
import {createStudioCompositionOverState} from "../../src/application/studio-controller";
import {loopArrangementFixture} from "../support/loop-arrangement-fixture";
import {createStudioAudio,type StudioAudioPort} from "../../src/application/studio-audio";
import {createFakeAudioPlatform} from "../../src/test-support/fake-audio-platform";
test("register maps the saved Manual notes and refuses stale document/revision/event authority",()=>{
  const f=loopArrangementFixture(),c=createStudioCompositionOverState(f.state,f.dependencies),before=c.readApplicationState();
  const source={documentId:before.document.id,revision:before.revision,eventId:"loop-event-0"};
  const r=c.controller.readRegister(source);if(!r.ok)throw new Error(r.message);
  expect(r.value.observations.ok?r.value.observations.value.notes.map(n=>n.midi):null).toEqual([60,64,67,71]);expect(r.value.externalBass).toBe(false);
  expect(c.readApplicationState()).toBe(before);
  expect(c.controller.readRegister({...source,documentId:"wrong"}).ok).toBe(false);
  expect(c.controller.readRegister({...source,eventId:"missing"}).ok).toBe(false);
  expect(c.controller.setTitle("Changed").ok).toBe(true);expect(c.controller.readRegister(source).ok).toBe(false);
});
test("Auto and Frozen use current inspector realization, never a synthetic keyboard octave",()=>{
  const f=loopArrangementFixture(),c=createStudioCompositionOverState(f.state,f.dependencies);
  expect(c.controller.selectEvent("loop-event-0").ok).toBe(true);
  let view=c.controller.readInspector("loop-event-0");if(!view.ok)throw new Error(view.message);
  expect(c.controller.applyInspectorChange(view.value.source,{kind:"auto",policy:{mode:"auto",family:"balanced",voiceCount:4,bassPolicy:"generated",range:{lowMidi:48,highMidi:72}},confirmed:true}).ok).toBe(true);
  view=c.controller.readInspector("loop-event-0");if(!view.ok)throw new Error(view.message);
  const auto=c.controller.readRegister(view.value.source);if(!auto.ok)throw new Error(auto.message);
  expect(auto.value.observations.ok?auto.value.observations.value.notes.map(n=>n.pitch):null).toEqual([...view.value.detail.voicing.activePitches]);
  const choice=view.value.choices.find(x=>x.current);if(choice===undefined)throw new Error("Missing current realization");
  expect(c.controller.applyInspectorChange(view.value.source,{kind:"freeze",choice,confirmed:true}).ok).toBe(true);
  view=c.controller.readInspector("loop-event-0");if(!view.ok)throw new Error(view.message);
  const frozen=c.controller.readRegister(view.value.source);if(!frozen.ok)throw new Error(frozen.message);
  expect(frozen.value.observations.ok?frozen.value.observations.value.notes.map(n=>n.pitch):null).toEqual([...choice.pitches]);expect(frozen.value.observations.ok?frozen.value.observations.value.notes.map(n=>n.midi):null).toEqual(auto.value.observations.ok?auto.value.observations.value.notes.map(n=>n.midi):null);
});
test("register view and existing inspector audition carry the same literal saved notes",async()=>{
  const f=loopArrangementFixture(),audio=createStudioAudio(createFakeAudioPlatform().platform),starts:number[][]=[];
  const port:StudioAudioPort={...audio,startPreview(...args){starts.push([...args[3]]);return audio.startPreview(...args);}};
  const c=createStudioCompositionOverState(f.state,f.dependencies,{audio:port});
  try{
    expect(c.controller.selectEvent("loop-event-0").ok).toBe(true);
    const before=c.readApplicationState(),source={documentId:before.document.id,revision:before.revision,eventId:"loop-event-0"};
    const view=c.controller.readRegister(source);if(!view.ok)throw new Error(view.message);
    expect(view.value.observations.ok?view.value.observations.value.notes.map(n=>n.midi):null).toEqual([60,64,67,71]);
    expect((await c.controller.previewInspector(source,{kind:"current"},{kind:"trusted-keyboard",trusted:true,sequence:1})).ok).toBe(true);
    expect(starts).toEqual([[60,64,67,71]]);
    expect((await c.controller.releaseInspectorPreview(source)).ok).toBe(true);
    expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(0);
    expect(c.readApplicationState().document).toBe(before.document);expect(c.readApplicationState().history).toBe(before.history);
  }finally{await audio.transportService.submitTransportCommand({commandRequestId:999,payload:{kind:"dispose-transport",reason:"page-teardown"}});}
},30000);
