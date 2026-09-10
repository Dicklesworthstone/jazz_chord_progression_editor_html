import { MIDI_PPQ, type BeatDuration, type BeatPosition } from "../domain";
import type { PerformanceEventProvenance, PlaybackPlan } from "../playback";

export type PerformedMidiRequest = Readonly<{
  plan: PlaybackPlan;
  provenance: readonly PerformanceEventProvenance[];
  title: string;
  markers: readonly Readonly<{ tick: number; text: string }>[];
}>;
export type PerformedMidiEvidence = Readonly<{
  attacks: number; pitches: number; channelChecks: number; messages: number;
}>;
export type PerformedMidiResult = Readonly<{ evidence: PerformedMidiEvidence }> & (
  Readonly<{ ok: true; bytes: Uint8Array; tempoMicroseconds: number; tempoErrorNumerator: number; tempoErrorDenominator: number }> |
  Readonly<{ ok: false; code: "performed-midi.invalid" | "performed-midi.limit" | "performed-midi.channels" }>
);

const CHANNELS = Object.freeze([0,1,2,3,4,5,6,7,8,10,11,12,13,14,15]);
const encoder = new TextEncoder();
type Message = Readonly<{ tick: number; on: boolean; note: number; velocity: number; channel: number; order: number }>;
function validText(text: string): boolean {
  if (typeof text !== "string" || text.length > 96 || text.trim().length === 0 || encoder.encode(text).length > 96) return false;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 32 || code === 127 || (code >= 0xd800 && code <= 0xdfff)) return false;
  }
  return true;
}
/** Widen P0 literal types at this defensive runtime boundary. */
function integerIn(value: number, low: number, high: number): boolean { return Number.isSafeInteger(value) && value >= low && value <= high; }
function exact(value: BeatPosition | BeatDuration, ticks: number): boolean {
  return Number.isSafeInteger(value.numerator) && value.numerator >= 0 && Number.isSafeInteger(value.denominator)
    && value.denominator > 0 && MIDI_PPQ % value.denominator === 0 && value.numerator * (MIDI_PPQ / value.denominator) === ticks;
}
function vlq(value: number): number[] {
  const bytes = [value & 127];
  for (let remaining = Math.floor(value / 128); remaining > 0; remaining = Math.floor(remaining / 128)) bytes.unshift((remaining & 127) | 128);
  return bytes;
}
function meta(type: number, payload: readonly number[]): number[] { return [255,type,...vlq(payload.length),...payload]; }
function word(value: number): number[] { return [(value >>> 8) & 255,value & 255]; }
function dword(value: number): number[] { return [(value >>> 24) & 255,(value >>> 16) & 255,...word(value)]; }
function track(messages: readonly Message[], title: string, total: number, channelOffset: number): number[] {
  const out = [0,...meta(3,[...encoder.encode(title)])];
  let tick = 0;
  for (const event of messages) {
    const channel = CHANNELS[event.channel + channelOffset];
    if (channel === undefined) throw new Error("Channel capacity");
    out.push(...vlq(event.tick-tick), (event.on ? 144 : 128) | channel, event.note, event.on ? event.velocity : 0);
    tick = event.tick;
  }
  out.push(...vlq(total-tick),...meta(47,[]));
  return [77,84,114,107,...dword(out.length),...out];
}

/** Additive format: every performed occurrence has an unambiguous channel lifetime. */
export function exportPerformedMidi(request: PerformedMidiRequest): PerformedMidiResult {
  let attacks=0,pitches=0,channelChecks=0,messages=0;
  const evidence = (): PerformedMidiEvidence => Object.freeze({attacks,pitches,channelChecks,messages});
  const refuse = (code: "performed-midi.invalid" | "performed-midi.limit" | "performed-midi.channels"): PerformedMidiResult => Object.freeze({ok:false,code,evidence:evidence()});
  try {
    const {plan,provenance} = request;
    if (!validText(request.title) || !integerIn(plan.midiPpq,960,960) || plan.meter.beatsPerBar !== 4 || plan.meter.beatUnit !== 4
      || !Number.isInteger(plan.tempoBpm) || plan.tempoBpm < 20 || plan.tempoBpm > 400
      || !Number.isSafeInteger(plan.totalTicks) || !exact(plan.totalBeats,plan.totalTicks)) return refuse("performed-midi.invalid");
    const start = plan.loopTicks?.start ?? 0, end = plan.loopTicks?.end ?? plan.totalTicks;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > plan.totalTicks) return refuse("performed-midi.invalid");
    if ((plan.loop === null) !== (plan.loopTicks === null) || (plan.loop !== null && (!exact(plan.loop.start,start) || !exact(plan.loop.end,end)))) return refuse("performed-midi.invalid");
    if (end-start > 16*3840 || plan.events.length > 1024 || provenance.length > 65536 || request.markers.length > 256) return refuse("performed-midi.limit");
    if (plan.events.length === 0) return refuse("performed-midi.invalid");
    const roles = new Map<string,PerformanceEventProvenance>();
    for (const origin of provenance) {
      if (roles.has(origin.eventId) || typeof origin.sourceEventId !== "string" || origin.sourceEventId.length===0 || (origin.role!=="bass" && origin.role!=="comp")) return refuse("performed-midi.invalid");
      roles.set(origin.eventId,origin);
    }
    const held = { bass: CHANNELS.map(() => new Float64Array(128)), comp: CHANNELS.map(() => new Float64Array(128)) };
    const lanes = {bass:0,comp:0};
    const bass:Message[]=[], comp:Message[]=[];
    const seen = new Set<string>();
    let previous=-1;
    for (const event of plan.events) {
      attacks+=1;
      const origin=roles.get(event.eventId);
      if (origin===undefined || seen.has(event.eventId) || event.startTick < previous || !Number.isSafeInteger(event.startTick)
        || !Number.isSafeInteger(event.durationTicks) || !Number.isSafeInteger(event.gateDurationTicks)
        || event.gateDurationTicks < 1 || event.durationTicks < event.gateDurationTicks || event.startTick < start || event.startTick+event.durationTicks > end
        || !exact(event.startBeat,event.startTick) || !exact(event.durationBeats,event.durationTicks) || !exact(event.gateDurationBeats,event.gateDurationTicks)
        || !integerIn(event.velocity,1,127) || event.midiPitches.length < 1 || event.midiPitches.length > 16) return refuse("performed-midi.invalid");
      previous=event.startTick;seen.add(event.eventId);
      if (origin.role === "literal") return refuse("performed-midi.invalid");
      const destination=origin.role==="bass" ? bass : comp;
      const roleHeld=held[origin.role];
      for (const note of event.midiPitches) {
        if (!Number.isInteger(note) || note<0 || note>127) return refuse("performed-midi.invalid");
        pitches+=1;
        if (pitches>16384) return refuse("performed-midi.limit");
        let index=-1;
        for (let i=0;i<CHANNELS.length;i++) {
          channelChecks+=1;
          if ((roleHeld[i]?.[note] ?? Number.POSITIVE_INFINITY) <= event.startTick) {index=i;break;}
        }
        const channel=index, slots=roleHeld[index];
        if (channel<0 || slots===undefined) return refuse("performed-midi.channels");
        lanes[origin.role]=Math.max(lanes[origin.role],index+1);
        slots[note]=event.startTick+event.gateDurationTicks;
        destination.push({tick:event.startTick-start,on:true,note,velocity:event.velocity,channel,order:pitches});
        destination.push({tick:event.startTick+event.gateDurationTicks-start,on:false,note,velocity:0,channel,order:pitches});
        messages+=2;
      }
    }
    if (lanes.bass + lanes.comp > CHANNELS.length) return refuse("performed-midi.channels");
    const compare=(a:Message,b:Message):number => a.tick-b.tick || Number(a.on)-Number(b.on) || a.order-b.order;
    bass.sort(compare);comp.sort(compare);
    const tempoMicroseconds=Math.round(60000000/plan.tempoBpm);
    const conductor=[0,...meta(3,[...encoder.encode(request.title)]),0,...meta(81,[(tempoMicroseconds>>>16)&255,(tempoMicroseconds>>>8)&255,tempoMicroseconds&255]),0,...meta(88,[4,2,24,8])];
    let markerTick=start;
    for (const marker of request.markers) {
      if (!Number.isSafeInteger(marker.tick) || marker.tick<markerTick || marker.tick>=end || !validText(marker.text)) return refuse("performed-midi.invalid");
      conductor.push(...vlq(marker.tick-markerTick),...meta(6,[...encoder.encode(marker.text)]));markerTick=marker.tick;
    }
    conductor.push(...vlq(end-markerTick),...meta(47,[]));
    const header=[77,84,104,100,0,0,0,6,0,1,0,3,...word(960)];
    const chunks=[header,[77,84,114,107,...dword(conductor.length),...conductor],track(bass,"Bass",end-start,0),track(comp,"Comp",end-start,lanes.bass)];
    const length=chunks.reduce((sum,chunk)=>sum+chunk.length,0);
    if (length>1048576) return refuse("performed-midi.limit");
    const bytes=new Uint8Array(length);let offset=0;
    for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
    return Object.freeze({ok:true,bytes,tempoMicroseconds,tempoErrorNumerator:tempoMicroseconds*plan.tempoBpm-60000000,tempoErrorDenominator:plan.tempoBpm,evidence:evidence()});
  } catch {return refuse("performed-midi.invalid");}
}
