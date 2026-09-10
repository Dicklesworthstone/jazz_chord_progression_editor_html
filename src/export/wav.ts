export type Pcm16WavResult=Readonly<{ok:true;bytes:Uint8Array<ArrayBuffer>}>|Readonly<{ok:false;message:string}>;
/** Bounded byte encoder only; no renderer, browser or audio graph imports. */
export function encodePcm16Wav(left:Float32Array,right:Float32Array):Pcm16WavResult {
  if(left.length<1||left.length>518400||right.length!==left.length)return {ok:false,message:"WAV needs equal stereo channels of 1–518,400 frames."};
  for(let i=0;i<left.length;i++){const l=left[i],r=right[i];if(l===undefined||r===undefined||!Number.isFinite(l)||!Number.isFinite(r)||Math.abs(l)>1||Math.abs(r)>1)return {ok:false,message:"WAV samples must be finite and within -1 to 1."};}
  const bytes=new Uint8Array(44+left.length*4),view=new DataView(bytes.buffer);
  const text=(at:number,value:string):void=>{for(let i=0;i<value.length;i++)bytes[at+i]=value.charCodeAt(i);};
  text(0,"RIFF");view.setUint32(4,bytes.length-8,true);text(8,"WAVE");text(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,32000,true);view.setUint32(28,128000,true);view.setUint16(32,4,true);view.setUint16(34,16,true);text(36,"data");view.setUint32(40,left.length*4,true);
  const quantize=(sample:number):number=>Math.round(sample*(sample<0?32768:32767));
  for(let i=0;i<left.length;i++){view.setInt16(44+i*4,quantize(left[i]??0),true);view.setInt16(46+i*4,quantize(right[i]??0),true);}
  return Object.freeze({ok:true,bytes});
}
