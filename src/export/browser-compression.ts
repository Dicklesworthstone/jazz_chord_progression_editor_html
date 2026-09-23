export type BoundedCompressionPort=(bytes:Uint8Array,outputLimit:number,signal?:AbortSignal)=>Promise<Uint8Array>;
/** Largest canonical chart JSON a compressed share link may carry (inflated). */
export const MAX_COMPRESSED_SHARE_TEXT_BYTES=65_536;
/** Largest compressed payload: its base64url plus "#zdoc=3." fits the 8,192-character fragment. */
export const MAX_COMPRESSED_SHARE_PAYLOAD_BYTES=6_138;
async function transform(bytes:Uint8Array,limit:number,inflate:boolean,signal?:AbortSignal):Promise<Uint8Array>{
 const inputLimit=inflate?MAX_COMPRESSED_SHARE_PAYLOAD_BYTES:MAX_COMPRESSED_SHARE_TEXT_BYTES,outputCeiling=inflate?MAX_COMPRESSED_SHARE_TEXT_BYTES:MAX_COMPRESSED_SHARE_PAYLOAD_BYTES;
 if(bytes.length===0||bytes.length>inputLimit||!Number.isInteger(limit)||limit<1||limit>outputCeiling)throw new Error("Compression bounds exceeded");
 const canceled=():boolean=>signal?.aborted===true;
 if(canceled())throw new Error("Compression canceled");
 const stream=new Blob([bytes.slice()]).stream().pipeThrough(inflate?new DecompressionStream("deflate"):new CompressionStream("deflate"));
 const reader=stream.getReader(),chunks:Uint8Array[]=[];let total=0;
 const abort=():void=>{void reader.cancel().catch(()=>undefined);};
 signal?.addEventListener("abort",abort,{once:true});
 try{
  for(;;){const next=await reader.read();if(canceled())throw new Error("Compression canceled");if(next.done)break;
   if(total+next.value.length>limit)throw new Error("Compression output limit exceeded");chunks.push(next.value);total+=next.value.length;
  }
  const result=new Uint8Array(total);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
 }finally{signal?.removeEventListener("abort",abort);await reader.cancel().catch(()=>undefined);reader.releaseLock();}
}
export const compressBrowserBytes:BoundedCompressionPort=(bytes,limit,signal)=>transform(bytes,limit,false,signal);
export const inflateBrowserBytes:BoundedCompressionPort=(bytes,limit,signal)=>transform(bytes,limit,true,signal);
